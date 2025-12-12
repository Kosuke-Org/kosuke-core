import { redirect } from 'next/navigation';

export default function AdminPage() {
  // Redirect to projects page by default
  redirect('/admin/projects');
}
