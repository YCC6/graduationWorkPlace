import AppLayout from "@/components/AppLayout";

export default function RootPageLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
