import type { IntegrationToolDef } from "../types";
import { flexParse } from "../shared/json-params";
import * as s from "./schemas";

// ── Client type ──

export type RailwayClient = {
  graphql: <T = unknown>(
    query: string,
    variables?: Record<string, unknown>
  ) => Promise<T>;
};

// ── Typed tool def ──

type RailwayToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    client: RailwayClient
  ) => Promise<unknown>;
};

// ── Tool implementations ──

export const RAILWAY_TOOLS: RailwayToolDef[] = [
  // ── 1. Check Status ──
  {
    name: "railway_check_status",
    description: "Verify Railway API authentication and connectivity",
    schema: s.checkStatusSchema,
    execute: async (_a, c) => {
      const data = await c.graphql<{ me: { name: string; email: string } }>(
        `query { me { name email } }`
      );
      return { status: "ok", user: data.me };
    },
  },

  // ── 2. List Projects ──
  {
    name: "railway_list_projects",
    description: "List all Railway projects in the workspace",
    schema: s.listProjectsSchema,
    execute: async (_a, c) => {
      const data = await c.graphql<{
        me: {
          projects: {
            edges: Array<{
              node: {
                id: string;
                name: string;
                description: string;
                createdAt: string;
                updatedAt: string;
              };
            }>;
          };
        };
      }>(
        `query {
          me {
            projects(first: 50) {
              edges {
                node {
                  id
                  name
                  description
                  createdAt
                  updatedAt
                }
              }
            }
          }
        }`
      );
      return data.me.projects.edges.map((e) => e.node);
    },
  },

  // ── 3. Create Project ──
  {
    name: "railway_create_project",
    description: "Create a new Railway project",
    schema: s.createProjectSchema,
    execute: async (a, c) => {
      const data = await c.graphql<{
        projectCreate: { id: string; name: string };
      }>(
        `mutation($input: ProjectCreateInput!) {
          projectCreate(input: $input) {
            id
            name
          }
        }`,
        {
          input: {
            name: a.name,
            ...(a.description ? { description: a.description } : {}),
          },
        }
      );
      return data.projectCreate;
    },
  },

  // ── 4. List Services ──
  {
    name: "railway_list_services",
    description: "List all services in a Railway project",
    schema: s.listServicesSchema,
    execute: async (a, c) => {
      const data = await c.graphql<{
        project: {
          services: {
            edges: Array<{
              node: {
                id: string;
                name: string;
                icon: string | null;
                createdAt: string;
              };
            }>;
          };
        };
      }>(
        `query($projectId: String!) {
          project(id: $projectId) {
            services {
              edges {
                node {
                  id
                  name
                  icon
                  createdAt
                }
              }
            }
          }
        }`,
        { projectId: a.project_id }
      );
      return data.project.services.edges.map((e) => e.node);
    },
  },

  // ── 5. Deploy ──
  {
    name: "railway_deploy",
    description:
      "Trigger a redeployment of a Railway service in a specific environment",
    schema: s.deploySchema,
    execute: async (a, c) => {
      const data = await c.graphql<{
        serviceInstanceRedeploy: boolean;
      }>(
        `mutation($serviceId: String!, $environmentId: String!) {
          serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
        }`,
        {
          serviceId: a.service_id,
          environmentId: a.environment_id,
        }
      );
      return { success: data.serviceInstanceRedeploy };
    },
  },

  // ── 6. Deploy Template ──
  {
    name: "railway_deploy_template",
    description: "Deploy a service from the Railway template catalog",
    schema: s.deployTemplateSchema,
    execute: async (a, c) => {
      const data = await c.graphql<{
        templateDeploy: {
          projectId: string;
          workflowId: string;
        };
      }>(
        `mutation($input: TemplateDeployInput!) {
          templateDeploy(input: $input) {
            projectId
            workflowId
          }
        }`,
        {
          input: {
            templateCode: a.template_code,
            ...(a.project_id ? { projectId: a.project_id } : {}),
            ...(a.environment_id
              ? { environmentId: a.environment_id }
              : {}),
          },
        }
      );
      return data.templateDeploy;
    },
  },

  // ── 7. Create Environment ──
  {
    name: "railway_create_environment",
    description: "Create a new environment in a Railway project",
    schema: s.createEnvironmentSchema,
    execute: async (a, c) => {
      const data = await c.graphql<{
        environmentCreate: { id: string; name: string };
      }>(
        `mutation($input: EnvironmentCreateInput!) {
          environmentCreate(input: $input) {
            id
            name
          }
        }`,
        {
          input: {
            projectId: a.project_id,
            name: a.name,
            ...(a.source_environment_id
              ? { sourceEnvironmentId: a.source_environment_id }
              : {}),
          },
        }
      );
      return data.environmentCreate;
    },
  },

  // ── 8. List Variables ──
  {
    name: "railway_list_variables",
    description:
      "List environment variables for a service in a specific environment",
    schema: s.listVariablesSchema,
    execute: async (a, c) => {
      const data = await c.graphql<{
        variables: Record<string, string>;
      }>(
        `query($projectId: String!, $serviceId: String!, $environmentId: String!) {
          variables(projectId: $projectId, serviceId: $serviceId, environmentId: $environmentId)
        }`,
        {
          projectId: a.project_id,
          serviceId: a.service_id,
          environmentId: a.environment_id,
        }
      );
      return data.variables;
    },
  },

  // ── 9. Set Variables ──
  {
    name: "railway_set_variables",
    description:
      "Set or update environment variables for a service in a specific environment",
    schema: s.setVariablesSchema,
    execute: async (a, c) => {
      const variables = flexParse<Record<string, string>>(a.variables) ?? {};
      const data = await c.graphql<{
        variableCollectionUpsert: boolean;
      }>(
        `mutation($input: VariableCollectionUpsertInput!) {
          variableCollectionUpsert(input: $input)
        }`,
        {
          input: {
            projectId: a.project_id,
            serviceId: a.service_id,
            environmentId: a.environment_id,
            variables,
          },
        }
      );
      return { success: data.variableCollectionUpsert };
    },
  },

  // ── 10. Generate Domain ──
  {
    name: "railway_generate_domain",
    description: "Generate a Railway domain for a service",
    schema: s.generateDomainSchema,
    execute: async (a, c) => {
      const data = await c.graphql<{
        serviceDomainCreate: { domain: string };
      }>(
        `mutation($input: ServiceDomainCreateInput!) {
          serviceDomainCreate(input: $input) {
            domain
          }
        }`,
        {
          input: {
            projectId: a.project_id,
            serviceId: a.service_id,
            environmentId: a.environment_id,
          },
        }
      );
      return data.serviceDomainCreate;
    },
  },

  // ── 11. List Deployments ──
  {
    name: "railway_list_deployments",
    description: "List recent deployments for a service with their status",
    schema: s.listDeploymentsSchema,
    execute: async (a, c) => {
      const limit = (a.limit as number) ?? 10;
      const data = await c.graphql<{
        deployments: {
          edges: Array<{
            node: {
              id: string;
              status: string;
              createdAt: string;
              meta: { message: string } | null;
            };
          }>;
        };
      }>(
        `query($input: DeploymentListInput!) {
          deployments(input: $input, first: ${limit}) {
            edges {
              node {
                id
                status
                createdAt
                meta {
                  ... on DeploymentMeta {
                    message
                  }
                }
              }
            }
          }
        }`,
        {
          input: {
            projectId: a.project_id,
            serviceId: a.service_id,
            ...(a.environment_id
              ? { environmentId: a.environment_id }
              : {}),
          },
        }
      );
      return data.deployments.edges.map((e) => e.node);
    },
  },

  // ── 12. Get Logs ──
  {
    name: "railway_get_logs",
    description: "Get build or deployment logs for a specific deployment",
    schema: s.getLogsSchema,
    execute: async (a, c) => {
      const logType = (a.log_type as string) ?? "deploy";
      const limit = (a.limit as number) ?? 100;

      if (logType === "build") {
        const data = await c.graphql<{
          buildLogs: Array<{ message: string; timestamp: string }>;
        }>(
          `query($deploymentId: String!, $limit: Int) {
            buildLogs(deploymentId: $deploymentId, limit: $limit) {
              message
              timestamp
            }
          }`,
          { deploymentId: a.deployment_id, limit }
        );
        return data.buildLogs;
      }

      const data = await c.graphql<{
        deploymentLogs: Array<{ message: string; timestamp: string }>;
      }>(
        `query($deploymentId: String!, $limit: Int) {
          deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
            message
            timestamp
          }
        }`,
        { deploymentId: a.deployment_id, limit }
      );
      return data.deploymentLogs;
    },
  },
];
