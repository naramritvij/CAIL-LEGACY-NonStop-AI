import { createContext, useContext } from "react";
import { request } from "./types";

export const WorkspaceRequestContext = createContext(request);

export function useWorkspaceRequest() {
  return useContext(WorkspaceRequestContext);
}

export function practiceRequest<T>(path: string, options?: RequestInit) {
  return request<T>(path, options, "/practice/api/v1");
}
