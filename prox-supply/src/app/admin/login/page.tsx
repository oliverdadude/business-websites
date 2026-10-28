import { redirect } from "next/navigation";
import { isAdmin } from "@/server/auth";
import { LoginForm } from "./LoginForm";
import { LogoMark } from "@/components/Logo";

export const metadata = { title: "Seller login", robots: { index: false } };

export default async function LoginPage() {
  if (await isAdmin()) redirect("/admin");
  const configured = !!process.env.ADMIN_PASSWORD_HASH && (process.env.SESSION_SECRET?.length ?? 0) >= 32;
  return (
    <div className="grid min-h-dvh place-items-center px-4">
      <div className="card card-pad w-full max-w-sm animate-rise">
        <LogoMark className="h-9 w-9" />
        <h1 className="mt-4 text-xl font-semibold">Seller login</h1>
        <p className="mt-1 text-sm text-fog-400">Admin area for the shop owner only.</p>
        {!configured && (
          <p className="notice-warn mt-4 text-xs">
            Admin login isn&apos;t configured. Set ADMIN_PASSWORD_HASH (npm run admin:hash) and a SESSION_SECRET of 32+ characters.
          </p>
        )}
        <LoginForm />
      </div>
    </div>
  );
}
