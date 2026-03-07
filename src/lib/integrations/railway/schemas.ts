import { z } from "zod";
import { jsonParam } from "../shared/json-params";

// ── Shared fragments ──

export const projectId = z.string().describe("Railway project ID");
export const serviceId = z.string().describe("Railway service ID");
export const environmentId = z.string().describe("Railway environment ID");

// ── Tool schemas ──

export const checkStatusSchema = z.object({});

export const listProjectsSchema = z.object({});

export const createProjectSchema = z.object({
  name: z.string().describe("Name for the new project"),
  description: z.string().optional().describe("Optional project description"),
});

export const listServicesSchema = z.object({
  project_id: projectId,
});

export const deploySchema = z.object({
  service_id: serviceId,
  environment_id: environmentId,
});

export const deployTemplateSchema = z.object({
  template_code: z.string().describe("Railway template code (e.g. 'redis', 'postgres', 'nextjs')"),
  project_id: projectId.optional().describe("Project ID to deploy into (creates new project if omitted)"),
  environment_id: environmentId.optional().describe("Environment ID (uses default if omitted)"),
});

export const createEnvironmentSchema = z.object({
  project_id: projectId,
  name: z.string().describe("Name for the new environment"),
  source_environment_id: environmentId.optional().describe("Environment ID to copy from (optional)"),
});

export const listVariablesSchema = z.object({
  project_id: projectId,
  service_id: serviceId,
  environment_id: environmentId,
});

export const setVariablesSchema = z.object({
  project_id: projectId,
  service_id: serviceId,
  environment_id: environmentId,
  variables: jsonParam("Object of key-value pairs to set as environment variables"),
});

export const generateDomainSchema = z.object({
  project_id: projectId,
  service_id: serviceId,
  environment_id: environmentId,
});

export const listDeploymentsSchema = z.object({
  project_id: projectId,
  service_id: serviceId,
  environment_id: environmentId.optional().describe("Filter by environment (optional)"),
  limit: z.number().int().min(1).max(100).optional().describe("Number of deployments to return (1-100, default 10)"),
});

export const getLogsSchema = z.object({
  deployment_id: z.string().describe("Railway deployment ID"),
  log_type: z
    .enum(["build", "deploy"])
    .optional()
    .describe("Type of logs to retrieve (default: deploy)"),
  limit: z.number().int().min(1).max(1000).optional().describe("Number of log lines to return (1-1000, default 100)"),
});
