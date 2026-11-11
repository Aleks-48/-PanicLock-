import "./globals.css";
export const metadata = {
  title: "PanicLock | Banking simulator",
  description:
    "An interactive mobile banking and duress protection demonstration.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
