import { redirect } from 'next/navigation';
import { getSsrActor } from '@/lib/ssr-api';
import ProjectWorkspaceClient from '@/components/projects/ProjectWorkspaceClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'BEMS ERP | Project Management' };

export default async function ProjectsPage() {
  const actor = await getSsrActor();

  if (!actor) {
    redirect('/?redirect=/projects');
  }

  // Separate Staff Execution Flow from Admin / Executive Command Center
  if (!['GMD', 'SUPER_ADMIN', 'SYSTEM_ADMIN', 'CUSTOM_ADMIN'].includes(String(actor.role).toUpperCase())) {
    redirect('/staff/projects');
  }

  return <ProjectWorkspaceClient />;
}
