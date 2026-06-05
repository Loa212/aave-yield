import { createRootRoute, Outlet } from "@tanstack/react-router";
import { AuthGate } from "@/components/auth-gate";
import { Providers } from "@/components/providers";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <Providers>
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
        <AuthGate>
          <Outlet />
        </AuthGate>
      </div>
    </Providers>
  );
}
