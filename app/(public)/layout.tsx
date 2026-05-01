/**
 * Public layout — unauthenticated pages (login, etc.).
 * No header, sidebar, or auth guard. Minimal wrapper.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
