import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Providers } from "@/components/providers";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <Providers>
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col">
        <Outlet />
      </div>
    </Providers>
  );
}
