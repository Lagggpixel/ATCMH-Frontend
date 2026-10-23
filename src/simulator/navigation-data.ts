import type {RoutePoint} from "./model";

export interface NavigationCatalog {
  revision: string; airport: string;
  fixes: {id: string; name: string; point: RoutePoint}[];
  procedures: {id: string; name: string; type: "SID" | "STAR" | "Approach"; routes: {id: string; name: string; pointCount: number}[]}[];
}
export interface NavigationRoute {revision: string; airport: string; procedureId: string; name: string; type: "SID" | "STAR" | "Approach"; routeId: string; points: RoutePoint[]}
