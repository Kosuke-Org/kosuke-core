import type { PutObjectCommandInput } from '@aws-sdk/client-s3';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import type { FileType } from './db/schema';

// S3 Client configuration for Digital Ocean Spaces
// Used for both development and production environments
const s3Client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: false, // Digital Ocean Spaces uses virtual-hosted-style
});

const S3_BUCKET = process.env.S3_BUCKET || '';

export interface MessageAttachmentPayload {
  upload: UploadResult;
}

// File upload result with metadata
interface UploadResult {
  fileUrl: string;
  filename: string; // Original filename
  storedFilename: string; // Sanitized filename used in storage
  fileType: FileType; // Uses enum from schema for type consistency
  mediaType: string; // MIME type
  fileSize: number;
}

// Generate secure random filename using UUID
// Preserves only the file extension for proper MIME type handling
// Original filename is stored in database metadata for display purposes
function generateFilename(originalName: string, prefix: string = ''): string {
  const sanitizedPrefix = prefix ? (prefix.endsWith('/') ? prefix : `${prefix}/`) : '';

  // Extract file extension using Node.js path module (handles edge cases like .tar.gz, hidden files, etc.)
  // Returns empty string if no extension exists
  const extension = extname(originalName).toLowerCase();

  // Generate cryptographically random UUID
  const uuid = randomUUID();

  // Return UUID-based filename with extension: prefix/uuid.ext
  return `${sanitizedPrefix}attachment-${uuid}${extension}`;
}

// Get Digital Ocean Spaces CDN URL
function getFileUrl(filename: string): string {
  const endpoint = process.env.S3_ENDPOINT || '';
  const bucket = process.env.S3_BUCKET || '';
  // Remove protocol from endpoint
  const endpointWithoutProtocol = endpoint.replace(/^https?:\/\//, '');
  return `https://${bucket}.${endpointWithoutProtocol}/${filename}`;
}

// Determine file type from MIME type
function getFileType(mediaType: string): FileType {
  if (mediaType.startsWith('image/')) {
    return 'image';
  }
  if (mediaType === 'application/pdf') {
    return 'document';
  }
  // Default to document for unsupported types
  return 'document';
}

type PutObjectBody = NonNullable<PutObjectCommandInput['Body']>;

// Convert the browser/File API stream into a Node.js readable stream for AWS SDK
function createReadableStream(file: globalThis.File): Readable {
  const webStream = file.stream();
  const reader = webStream.getReader();

  return Readable.from(
    (async function* () {
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          if (value) {
            yield value;
          }
        }
      } finally {
        reader.releaseLock();
      }
    })(),
    { objectMode: false }
  );
}

// Upload to Digital Ocean Spaces (supports streaming uploads to avoid buffering large files)
async function uploadFileToS3(
  file: globalThis.File,
  filename: string,
  body: PutObjectBody
): Promise<UploadResult> {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: filename,
    Body: body,
    ContentType: file.type,
    ContentLength: file.size,
    ACL: 'public-read', // Make files publicly accessible
  });

  await s3Client.send(command);

  return {
    fileUrl: getFileUrl(filename),
    filename: file.name,
    storedFilename: filename,
    fileType: getFileType(file.type),
    mediaType: file.type,
    fileSize: file.size,
  };
}

/**
 * Generic file upload function
 * Uploads files to Digital Ocean Spaces in both development and production
 * @param file File to upload
 * @param prefix Optional prefix for organizing files (e.g., 'documents/', 'images/')
 * @returns Upload result with file metadata
 */
export async function uploadFile(
  file: globalThis.File,
  prefix: string = ''
): Promise<UploadResult> {
  try {
    const filename = generateFilename(file.name, prefix);
    const fileBody: PutObjectBody = createReadableStream(file);
    return await uploadFileToS3(file, filename, fileBody);
  } catch (error) {
    console.error('Error uploading file:', error);
    throw new Error(
      `Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
