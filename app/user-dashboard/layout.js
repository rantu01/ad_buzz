import ClientLayout from './ClientLayout';

export const metadata = {
  title: 'Ad Buzz',
  description: 'Ad Buzz - Client Dashboard',
};

export default function UserDashboardLayout({ children }) {
  return (
    <div className="min-h-screen bg-[#FFF8F3] text-slate-900">
      <ClientLayout>{children}</ClientLayout>
    </div>
  );
}
