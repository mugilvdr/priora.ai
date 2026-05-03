import Navbar from '@/components/Navbar';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#0a0f1e] flex flex-col">
      <Navbar />
      <main className="flex-1 w-full">
        {children}
      </main>
    </div>
  );
}
