import { notFound, redirect } from "next/navigation";
import { getSchema, SCHEMA_LIST } from "@/lib/schema";
import { currentUser } from "@/lib/session";
import AppHeader from "@/components/AppHeader";

/**
 * The header lives in the layout so switching registers keeps the chrome on
 * screen: only the body swaps out, and `loading.tsx` fills it while the new
 * sheet loads. Rendering it from the page instead made every switch blank the
 * whole window.
 */
export default async function SheetLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ sheet: string }>;
}) {
  const { sheet } = await params;
  const schema = getSchema(sheet);
  if (!schema) notFound();

  const user = await currentUser();
  if (!user) redirect(`/signin?callbackUrl=/${sheet}`);

  return (
    <div className="min-h-screen">
      <AppHeader
        user={user}
        sheets={SCHEMA_LIST.map((s) => ({ id: s.id, label: s.label }))}
        active={schema.id}
      />
      {children}
    </div>
  );
}
