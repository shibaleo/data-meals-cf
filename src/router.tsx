import { lazy, Suspense } from "react";
import {
  createRouter,
  createRoute,
  createRootRoute,
  redirect,
  Outlet,
} from "@tanstack/react-router";
import { AuthGate } from "@/components/auth/auth-gate";
import { AppLayout } from "@/components/layout/app-layout";
import { AuthenticateWithRedirectCallback } from "@clerk/react";

const IntakesPage = lazy(() => import("./app/(pages)/intakes/page"));
const MealsPage = lazy(() => import("./app/(pages)/meals/page"));
const FoodsPage = lazy(() => import("./app/(pages)/foods/page"));
const ThroughputPage = lazy(() => import("./app/(pages)/throughput/page"));
const TimingPage = lazy(() => import("./app/(pages)/timing/page"));
const AboutPage = lazy(() => import("./app/(pages)/about/page"));

const rootRoute = createRootRoute({
  component: () => <Outlet />,
});

const authLayout = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  component: () => (
    <AuthGate>
      <AppLayout>
        <Suspense>
          <Outlet />
        </Suspense>
      </AppLayout>
    </AuthGate>
  ),
});

function lazyRoute(
  path: string,
  Component: React.LazyExoticComponent<React.ComponentType>,
) {
  return createRoute({
    getParentRoute: () => authLayout,
    path,
    component: () => <Component />,
  });
}

const intakesRoute = lazyRoute("/intakes", IntakesPage);
const mealsRoute = lazyRoute("/meals", MealsPage);
const foodsRoute = lazyRoute("/foods", FoodsPage);
const throughputRoute = lazyRoute("/throughput", ThroughputPage);
const timingRoute = lazyRoute("/timing", TimingPage);
const aboutRoute = lazyRoute("/about", AboutPage);

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/intakes" as string });
  },
});

const ssoCallbackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sso-callback",
  component: () => <AuthenticateWithRedirectCallback />,
});

const routeTree = rootRoute.addChildren([
  authLayout.addChildren([
    intakesRoute,
    mealsRoute,
    foodsRoute,
    throughputRoute,
    timingRoute,
    aboutRoute,
  ]),
  indexRoute,
  ssoCallbackRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
