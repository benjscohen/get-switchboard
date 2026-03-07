import {
  projectId,
  serviceId,
  environmentId,
  checkStatusSchema,
  listProjectsSchema,
  createProjectSchema,
  listServicesSchema,
  deploySchema,
  deployTemplateSchema,
  createEnvironmentSchema,
  listVariablesSchema,
  setVariablesSchema,
  generateDomainSchema,
  listDeploymentsSchema,
  getLogsSchema,
} from "./schemas";
import { RAILWAY_TOOLS } from "./tools";

// ── Shared fragments ──

describe("shared fragments", () => {
  it("projectId requires a string", () => {
    expect(() => projectId.parse(undefined)).toThrow();
    expect(projectId.parse("proj-123")).toBe("proj-123");
  });

  it("serviceId requires a string", () => {
    expect(() => serviceId.parse(undefined)).toThrow();
    expect(serviceId.parse("svc-456")).toBe("svc-456");
  });

  it("environmentId requires a string", () => {
    expect(() => environmentId.parse(undefined)).toThrow();
    expect(environmentId.parse("env-789")).toBe("env-789");
  });
});

// ── Check Status ──

describe("checkStatusSchema", () => {
  it("accepts empty object", () => {
    const result = checkStatusSchema.parse({});
    expect(result).toEqual({});
  });
});

// ── List Projects ──

describe("listProjectsSchema", () => {
  it("accepts empty object", () => {
    const result = listProjectsSchema.parse({});
    expect(result).toEqual({});
  });
});

// ── Create Project ──

describe("createProjectSchema", () => {
  it("requires name", () => {
    expect(() => createProjectSchema.parse({})).toThrow();
  });

  it("accepts name only", () => {
    const result = createProjectSchema.parse({ name: "My Project" });
    expect(result.name).toBe("My Project");
    expect(result.description).toBeUndefined();
  });

  it("accepts name and description", () => {
    const result = createProjectSchema.parse({
      name: "My Project",
      description: "A test project",
    });
    expect(result.name).toBe("My Project");
    expect(result.description).toBe("A test project");
  });
});

// ── List Services ──

describe("listServicesSchema", () => {
  it("requires project_id", () => {
    expect(() => listServicesSchema.parse({})).toThrow();
  });

  it("accepts valid input", () => {
    const result = listServicesSchema.parse({ project_id: "proj-123" });
    expect(result.project_id).toBe("proj-123");
  });
});

// ── Deploy ──

describe("deploySchema", () => {
  it("requires service_id and environment_id", () => {
    expect(() => deploySchema.parse({})).toThrow();
    expect(() => deploySchema.parse({ service_id: "svc-1" })).toThrow();
    expect(() =>
      deploySchema.parse({ environment_id: "env-1" })
    ).toThrow();
  });

  it("accepts valid input", () => {
    const result = deploySchema.parse({
      service_id: "svc-1",
      environment_id: "env-1",
    });
    expect(result.service_id).toBe("svc-1");
    expect(result.environment_id).toBe("env-1");
  });
});

// ── Deploy Template ──

describe("deployTemplateSchema", () => {
  it("requires template_code", () => {
    expect(() => deployTemplateSchema.parse({})).toThrow();
  });

  it("accepts template_code only", () => {
    const result = deployTemplateSchema.parse({ template_code: "redis" });
    expect(result.template_code).toBe("redis");
    expect(result.project_id).toBeUndefined();
  });

  it("accepts all fields", () => {
    const result = deployTemplateSchema.parse({
      template_code: "postgres",
      project_id: "proj-1",
      environment_id: "env-1",
    });
    expect(result.template_code).toBe("postgres");
    expect(result.project_id).toBe("proj-1");
    expect(result.environment_id).toBe("env-1");
  });
});

// ── Create Environment ──

describe("createEnvironmentSchema", () => {
  it("requires project_id and name", () => {
    expect(() => createEnvironmentSchema.parse({})).toThrow();
    expect(() =>
      createEnvironmentSchema.parse({ project_id: "proj-1" })
    ).toThrow();
  });

  it("accepts required fields", () => {
    const result = createEnvironmentSchema.parse({
      project_id: "proj-1",
      name: "staging",
    });
    expect(result.project_id).toBe("proj-1");
    expect(result.name).toBe("staging");
  });

  it("accepts source_environment_id", () => {
    const result = createEnvironmentSchema.parse({
      project_id: "proj-1",
      name: "staging",
      source_environment_id: "env-prod",
    });
    expect(result.source_environment_id).toBe("env-prod");
  });
});

// ── List Variables ──

describe("listVariablesSchema", () => {
  it("requires project_id, service_id, and environment_id", () => {
    expect(() => listVariablesSchema.parse({})).toThrow();
    expect(() =>
      listVariablesSchema.parse({ project_id: "p1", service_id: "s1" })
    ).toThrow();
  });

  it("accepts valid input", () => {
    const result = listVariablesSchema.parse({
      project_id: "p1",
      service_id: "s1",
      environment_id: "e1",
    });
    expect(result.project_id).toBe("p1");
    expect(result.service_id).toBe("s1");
    expect(result.environment_id).toBe("e1");
  });
});

// ── Set Variables ──

describe("setVariablesSchema", () => {
  it("requires project_id, service_id, environment_id, and variables", () => {
    expect(() => setVariablesSchema.parse({})).toThrow();
    expect(() =>
      setVariablesSchema.parse({
        project_id: "p1",
        service_id: "s1",
        environment_id: "e1",
      })
    ).toThrow();
  });

  it("accepts JSON string variables", () => {
    const result = setVariablesSchema.parse({
      project_id: "p1",
      service_id: "s1",
      environment_id: "e1",
      variables: '{"PORT":"3000","NODE_ENV":"production"}',
    });
    expect(result.variables).toContain("PORT");
  });

  it("accepts object variables", () => {
    const result = setVariablesSchema.parse({
      project_id: "p1",
      service_id: "s1",
      environment_id: "e1",
      variables: { PORT: "3000" },
    });
    expect(result.variables).toEqual({ PORT: "3000" });
  });
});

// ── Generate Domain ──

describe("generateDomainSchema", () => {
  it("requires project_id, service_id, and environment_id", () => {
    expect(() => generateDomainSchema.parse({})).toThrow();
  });

  it("accepts valid input", () => {
    const result = generateDomainSchema.parse({
      project_id: "p1",
      service_id: "s1",
      environment_id: "e1",
    });
    expect(result.project_id).toBe("p1");
  });
});

// ── List Deployments ──

describe("listDeploymentsSchema", () => {
  it("requires project_id and service_id", () => {
    expect(() => listDeploymentsSchema.parse({})).toThrow();
    expect(() =>
      listDeploymentsSchema.parse({ project_id: "p1" })
    ).toThrow();
  });

  it("accepts required fields", () => {
    const result = listDeploymentsSchema.parse({
      project_id: "p1",
      service_id: "s1",
    });
    expect(result.project_id).toBe("p1");
    expect(result.environment_id).toBeUndefined();
  });

  it("accepts optional fields", () => {
    const result = listDeploymentsSchema.parse({
      project_id: "p1",
      service_id: "s1",
      environment_id: "e1",
      limit: 25,
    });
    expect(result.environment_id).toBe("e1");
    expect(result.limit).toBe(25);
  });

  it("rejects invalid limit", () => {
    expect(() =>
      listDeploymentsSchema.parse({
        project_id: "p1",
        service_id: "s1",
        limit: 200,
      })
    ).toThrow();
  });
});

// ── Get Logs ──

describe("getLogsSchema", () => {
  it("requires deployment_id", () => {
    expect(() => getLogsSchema.parse({})).toThrow();
  });

  it("accepts deployment_id only", () => {
    const result = getLogsSchema.parse({ deployment_id: "d1" });
    expect(result.deployment_id).toBe("d1");
    expect(result.log_type).toBeUndefined();
  });

  it.each(["build", "deploy"] as const)(
    "accepts log_type '%s'",
    (log_type) => {
      const result = getLogsSchema.parse({ deployment_id: "d1", log_type });
      expect(result.log_type).toBe(log_type);
    }
  );

  it("rejects invalid log_type", () => {
    expect(() =>
      getLogsSchema.parse({ deployment_id: "d1", log_type: "runtime" })
    ).toThrow();
  });

  it("accepts limit", () => {
    const result = getLogsSchema.parse({
      deployment_id: "d1",
      limit: 500,
    });
    expect(result.limit).toBe(500);
  });

  it("rejects invalid limit", () => {
    expect(() =>
      getLogsSchema.parse({ deployment_id: "d1", limit: 2000 })
    ).toThrow();
  });
});

// ── Tool count ──

describe("tool count", () => {
  it("exports exactly 12 tools", () => {
    expect(RAILWAY_TOOLS).toHaveLength(12);
  });
});

// ── Cross-cutting: schemas with required fields reject {} ──

describe("all schemas with required fields reject empty object", () => {
  it.each([
    ["createProjectSchema", createProjectSchema],
    ["listServicesSchema", listServicesSchema],
    ["deploySchema", deploySchema],
    ["deployTemplateSchema", deployTemplateSchema],
    ["createEnvironmentSchema", createEnvironmentSchema],
    ["listVariablesSchema", listVariablesSchema],
    ["setVariablesSchema", setVariablesSchema],
    ["generateDomainSchema", generateDomainSchema],
    ["listDeploymentsSchema", listDeploymentsSchema],
    ["getLogsSchema", getLogsSchema],
  ] as const)("%s rejects {}", (_name, schema) => {
    expect(() => schema.parse({})).toThrow();
  });
});
