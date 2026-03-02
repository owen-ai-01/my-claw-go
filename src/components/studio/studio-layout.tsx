import { StudioHeader } from './studio-header';
import { StudioSidebar } from './studio-sidebar';

interface StudioLayoutProps {
  children: React.ReactNode;
}

export function StudioLayout({ children }: StudioLayoutProps) {
  return (
    <div className="h-screen bg-background flex flex-col">
      <StudioHeader />
      <div className="flex flex-1 overflow-hidden">
        <StudioSidebar />
        <main className="flex-1 overflow-y-auto overflow-x-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
