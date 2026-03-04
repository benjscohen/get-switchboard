import {
  taskGid,
  projectGid,
  workspaceGid,
  sectionGid,
  goalGid,
  tagGid,
  customFieldGid,
  portfolioGid,
  templateGid,
  customFieldType,
  optFields,
  asanaColor,
  searchTasksSchema,
  getTaskSchema,
  createTaskSchema,
  updateTaskSchema,
  manageTaskRelationsSchema,
  manageTaskDependenciesSchema,
  manageSubtasksSchema,
  manageProjectsSchema,
  manageSectionsSchema,
  manageStoriesSchema,
  manageGoalsSchema,
  manageTagsSchema,
  getContextSchema,
  manageCustomFieldsSchema,
  managePortfoliosSchema,
  manageAttachmentsSchema,
  manageTemplatesSchema,
} from "./schemas";
import { ASANA_TOOLS } from "./tools";

// ── Shared fragments ──

describe("shared fragments", () => {
  it("taskGid requires a string", () => {
    expect(() => taskGid.parse(undefined)).toThrow();
    expect(taskGid.parse("12345")).toBe("12345");
  });

  it("projectGid requires a string", () => {
    expect(() => projectGid.parse(undefined)).toThrow();
    expect(projectGid.parse("proj1")).toBe("proj1");
  });

  it("workspaceGid requires a string", () => {
    expect(() => workspaceGid.parse(undefined)).toThrow();
    expect(workspaceGid.parse("ws1")).toBe("ws1");
  });

  it("sectionGid requires a string", () => {
    expect(() => sectionGid.parse(undefined)).toThrow();
    expect(sectionGid.parse("sec1")).toBe("sec1");
  });

  it("goalGid requires a string", () => {
    expect(() => goalGid.parse(undefined)).toThrow();
    expect(goalGid.parse("goal1")).toBe("goal1");
  });

  it("tagGid requires a string", () => {
    expect(() => tagGid.parse(undefined)).toThrow();
    expect(tagGid.parse("tag1")).toBe("tag1");
  });

  it("customFieldGid requires a string", () => {
    expect(() => customFieldGid.parse(undefined)).toThrow();
    expect(customFieldGid.parse("cf1")).toBe("cf1");
  });

  it("portfolioGid requires a string", () => {
    expect(() => portfolioGid.parse(undefined)).toThrow();
    expect(portfolioGid.parse("port1")).toBe("port1");
  });

  it("templateGid requires a string", () => {
    expect(() => templateGid.parse(undefined)).toThrow();
    expect(templateGid.parse("tmpl1")).toBe("tmpl1");
  });

  it.each(["text", "number", "enum", "multi_enum", "date", "people"] as const)(
    "customFieldType accepts '%s'",
    (type) => {
      expect(customFieldType.parse(type)).toBe(type);
    }
  );

  it("customFieldType rejects invalid values", () => {
    expect(() => customFieldType.parse("boolean")).toThrow();
  });

  it("optFields is optional", () => {
    expect(optFields.parse(undefined)).toBeUndefined();
    expect(optFields.parse("name,due_on")).toBe("name,due_on");
  });

  it.each([
    "dark-pink",
    "dark-green",
    "dark-blue",
    "dark-red",
    "dark-teal",
    "dark-brown",
    "dark-orange",
    "dark-purple",
    "dark-warm-gray",
    "light-pink",
    "light-green",
    "light-blue",
    "light-red",
    "light-teal",
    "light-brown",
    "light-orange",
    "light-purple",
    "light-warm-gray",
    "none",
  ] as const)("asanaColor accepts '%s'", (color) => {
    expect(asanaColor.parse(color)).toBe(color);
  });

  it("asanaColor is optional", () => {
    expect(asanaColor.parse(undefined)).toBeUndefined();
  });

  it("asanaColor rejects invalid values", () => {
    expect(() => asanaColor.parse("red")).toThrow();
  });
});

// ── Task schemas ──

describe("task schemas", () => {
  describe("searchTasksSchema", () => {
    it("requires workspace", () => {
      expect(() => searchTasksSchema.parse({})).toThrow();
    });

    it("accepts minimal input", () => {
      const result = searchTasksSchema.parse({ workspace: "ws1" });
      expect(result.workspace).toBe("ws1");
      expect(result.text).toBeUndefined();
    });

    it("accepts full search filters", () => {
      const result = searchTasksSchema.parse({
        workspace: "ws1",
        text: "bug fix",
        assignee: "me",
        project: "proj1",
        completed: false,
        sort_by: "due_date",
        limit: 50,
      });
      expect(result.text).toBe("bug fix");
      expect(result.sort_by).toBe("due_date");
    });

    it.each([
      "due_date",
      "created_at",
      "completed_at",
      "likes",
      "modified_at",
    ] as const)("accepts sort_by '%s'", (sort) => {
      const result = searchTasksSchema.parse({
        workspace: "ws1",
        sort_by: sort,
      });
      expect(result.sort_by).toBe(sort);
    });

    it("rejects invalid sort_by", () => {
      expect(() =>
        searchTasksSchema.parse({ workspace: "ws1", sort_by: "name" })
      ).toThrow();
    });
  });

  describe("getTaskSchema", () => {
    it("requires task_gid", () => {
      expect(() => getTaskSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = getTaskSchema.parse({ task_gid: "t1" });
      expect(result.task_gid).toBe("t1");
      expect(result.opt_fields).toBeUndefined();
    });
  });

  describe("createTaskSchema", () => {
    it("requires workspace and name", () => {
      expect(() => createTaskSchema.parse({})).toThrow();
      expect(() =>
        createTaskSchema.parse({ workspace: "ws1" })
      ).toThrow();
      expect(() => createTaskSchema.parse({ name: "Task" })).toThrow();
    });

    it("accepts minimal valid input", () => {
      const result = createTaskSchema.parse({
        workspace: "ws1",
        name: "New task",
      });
      expect(result.name).toBe("New task");
      expect(result.assignee).toBeUndefined();
    });

    it("accepts full input", () => {
      const result = createTaskSchema.parse({
        workspace: "ws1",
        name: "Full task",
        notes: "Description",
        assignee: "me",
        due_on: "2025-12-31",
        projects: "proj1,proj2",
        tags: "tag1",
        parent: "parent1",
        followers: "u1,u2",
        custom_fields: '{"cf1":"value"}',
      });
      expect(result.projects).toBe("proj1,proj2");
      expect(result.custom_fields).toBe('{"cf1":"value"}');
    });
  });

  describe("updateTaskSchema", () => {
    it("requires task_gid", () => {
      expect(() => updateTaskSchema.parse({})).toThrow();
    });

    it("accepts valid input with optional fields", () => {
      const result = updateTaskSchema.parse({
        task_gid: "t1",
        name: "Updated",
        completed: true,
      });
      expect(result.name).toBe("Updated");
      expect(result.completed).toBe(true);
    });
  });

  describe("manageTaskRelationsSchema", () => {
    it("requires task_gid and operation", () => {
      expect(() => manageTaskRelationsSchema.parse({})).toThrow();
      expect(() =>
        manageTaskRelationsSchema.parse({ task_gid: "t1" })
      ).toThrow();
    });

    it.each([
      "add_project",
      "remove_project",
      "set_section",
      "add_tag",
      "remove_tag",
      "set_parent",
      "add_followers",
    ] as const)("accepts operation '%s'", (operation) => {
      const result = manageTaskRelationsSchema.parse({
        task_gid: "t1",
        operation,
      });
      expect(result.operation).toBe(operation);
    });

    it("rejects invalid operation", () => {
      expect(() =>
        manageTaskRelationsSchema.parse({
          task_gid: "t1",
          operation: "delete",
        })
      ).toThrow();
    });

    it("accepts optional relation fields", () => {
      const result = manageTaskRelationsSchema.parse({
        task_gid: "t1",
        operation: "add_project",
        project_gid: "proj1",
        section_gid: "sec1",
      });
      expect(result.project_gid).toBe("proj1");
    });
  });

  describe("manageTaskDependenciesSchema", () => {
    it("requires task_gid, operation, and targets", () => {
      expect(() => manageTaskDependenciesSchema.parse({})).toThrow();
      expect(() =>
        manageTaskDependenciesSchema.parse({ task_gid: "t1" })
      ).toThrow();
      expect(() =>
        manageTaskDependenciesSchema.parse({
          task_gid: "t1",
          operation: "add_dependencies",
        })
      ).toThrow();
    });

    it.each([
      "add_dependencies",
      "remove_dependencies",
      "add_dependents",
      "remove_dependents",
    ] as const)("accepts operation '%s'", (operation) => {
      const result = manageTaskDependenciesSchema.parse({
        task_gid: "t1",
        operation,
        targets: "t2,t3",
      });
      expect(result.operation).toBe(operation);
      expect(result.targets).toBe("t2,t3");
    });

    it("rejects invalid operation", () => {
      expect(() =>
        manageTaskDependenciesSchema.parse({
          task_gid: "t1",
          operation: "link",
          targets: "t2",
        })
      ).toThrow();
    });
  });

  describe("manageSubtasksSchema", () => {
    it("requires task_gid and operation", () => {
      expect(() => manageSubtasksSchema.parse({})).toThrow();
      expect(() =>
        manageSubtasksSchema.parse({ task_gid: "t1" })
      ).toThrow();
    });

    it.each(["list", "create", "reorder"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageSubtasksSchema.parse({
          task_gid: "t1",
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    );

    it("accepts create fields", () => {
      const result = manageSubtasksSchema.parse({
        task_gid: "t1",
        operation: "create",
        name: "Subtask",
        assignee: "me",
        due_on: "2025-06-15",
      });
      expect(result.name).toBe("Subtask");
    });

    it("accepts reorder fields", () => {
      const result = manageSubtasksSchema.parse({
        task_gid: "t1",
        operation: "reorder",
        subtask_gid: "sub1",
        insert_before: "sub2",
      });
      expect(result.subtask_gid).toBe("sub1");
    });
  });
});

// ── Organization schemas ──

describe("organization schemas", () => {
  describe("manageProjectsSchema", () => {
    it("requires operation", () => {
      expect(() => manageProjectsSchema.parse({})).toThrow();
    });

    it.each([
      "list",
      "get",
      "create",
      "update",
      "delete",
      "task_counts",
    ] as const)("accepts operation '%s'", (operation) => {
      const result = manageProjectsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    });

    it("rejects invalid operation", () => {
      expect(() =>
        manageProjectsSchema.parse({ operation: "archive" })
      ).toThrow();
    });

    it("accepts create fields", () => {
      const result = manageProjectsSchema.parse({
        operation: "create",
        workspace: "ws1",
        name: "Project",
        color: "dark-blue",
        layout: "board",
        team: "team1",
      });
      expect(result.name).toBe("Project");
      expect(result.layout).toBe("board");
    });

    it.each(["list", "board", "timeline", "calendar"] as const)(
      "accepts layout '%s'",
      (layout) => {
        const result = manageProjectsSchema.parse({
          operation: "create",
          layout,
        });
        expect(result.layout).toBe(layout);
      }
    );
  });

  describe("manageSectionsSchema", () => {
    it("requires project_gid and operation", () => {
      expect(() => manageSectionsSchema.parse({})).toThrow();
      expect(() =>
        manageSectionsSchema.parse({ project_gid: "p1" })
      ).toThrow();
    });

    it.each(["list", "create", "update", "delete", "reorder"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageSectionsSchema.parse({
          project_gid: "p1",
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    );

    it("accepts reorder fields", () => {
      const result = manageSectionsSchema.parse({
        project_gid: "p1",
        operation: "reorder",
        section_gid: "sec1",
        before_section: "sec2",
      });
      expect(result.section_gid).toBe("sec1");
    });
  });

  describe("manageStoriesSchema", () => {
    it("requires task_gid and operation", () => {
      expect(() => manageStoriesSchema.parse({})).toThrow();
      expect(() =>
        manageStoriesSchema.parse({ task_gid: "t1" })
      ).toThrow();
    });

    it.each(["list", "create", "update", "delete"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageStoriesSchema.parse({
          task_gid: "t1",
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    );

    it("accepts text for create", () => {
      const result = manageStoriesSchema.parse({
        task_gid: "t1",
        operation: "create",
        text: "Great work!",
      });
      expect(result.text).toBe("Great work!");
    });
  });

  describe("manageGoalsSchema", () => {
    it("requires operation", () => {
      expect(() => manageGoalsSchema.parse({})).toThrow();
    });

    it.each([
      "list",
      "get",
      "create",
      "update",
      "update_metric",
    ] as const)("accepts operation '%s'", (operation) => {
      const result = manageGoalsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    });

    it("rejects invalid operation", () => {
      expect(() =>
        manageGoalsSchema.parse({ operation: "delete" })
      ).toThrow();
    });

    it.each([
      "green",
      "yellow",
      "red",
      "blue",
      "achieved",
      "partial",
      "missed",
      "dropped",
    ] as const)("accepts status '%s'", (status) => {
      const result = manageGoalsSchema.parse({
        operation: "update",
        goal_gid: "g1",
        status,
      });
      expect(result.status).toBe(status);
    });

    it("rejects invalid status", () => {
      expect(() =>
        manageGoalsSchema.parse({
          operation: "update",
          goal_gid: "g1",
          status: "orange",
        })
      ).toThrow();
    });

    it("accepts metric fields for update_metric", () => {
      const result = manageGoalsSchema.parse({
        operation: "update_metric",
        goal_gid: "g1",
        current_number_value: 42,
        target_number_value: 100,
      });
      expect(result.current_number_value).toBe(42);
      expect(result.target_number_value).toBe(100);
    });
  });
});

// ── Utility schemas ──

describe("utility schemas", () => {
  describe("manageTagsSchema", () => {
    it("requires operation", () => {
      expect(() => manageTagsSchema.parse({})).toThrow();
    });

    it.each(["list", "get", "create", "update"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageTagsSchema.parse({ operation });
        expect(result.operation).toBe(operation);
      }
    );

    it("accepts create fields with color", () => {
      const result = manageTagsSchema.parse({
        operation: "create",
        workspace: "ws1",
        name: "Bug",
        color: "dark-red",
      });
      expect(result.name).toBe("Bug");
      expect(result.color).toBe("dark-red");
    });
  });

  describe("getContextSchema", () => {
    it("requires operation", () => {
      expect(() => getContextSchema.parse({})).toThrow();
    });

    it.each([
      "list_workspaces",
      "list_teams",
      "list_users",
      "get_user",
      "list_projects",
    ] as const)("accepts operation '%s'", (operation) => {
      const result = getContextSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    });

    it("rejects invalid operation", () => {
      expect(() =>
        getContextSchema.parse({ operation: "list_goals" })
      ).toThrow();
    });

    it("accepts workspace and team_gid", () => {
      const result = getContextSchema.parse({
        operation: "list_users",
        workspace: "ws1",
        team_gid: "team1",
      });
      expect(result.workspace).toBe("ws1");
      expect(result.team_gid).toBe("team1");
    });

    it("accepts user_gid for get_user", () => {
      const result = getContextSchema.parse({
        operation: "get_user",
        user_gid: "me",
      });
      expect(result.user_gid).toBe("me");
    });
  });
});

// ── v2 schemas ──

describe("v2 schemas", () => {
  describe("manageCustomFieldsSchema", () => {
    it("requires operation", () => {
      expect(() => manageCustomFieldsSchema.parse({})).toThrow();
    });

    it.each([
      "list",
      "get",
      "create",
      "update",
      "delete",
      "create_enum_option",
    ] as const)("accepts operation '%s'", (operation) => {
      const result = manageCustomFieldsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    });

    it("rejects invalid operation", () => {
      expect(() =>
        manageCustomFieldsSchema.parse({ operation: "archive" })
      ).toThrow();
    });

    it("accepts create fields", () => {
      const result = manageCustomFieldsSchema.parse({
        operation: "create",
        workspace: "ws1",
        name: "Priority",
        resource_subtype: "enum",
      });
      expect(result.name).toBe("Priority");
      expect(result.resource_subtype).toBe("enum");
    });

    it("accepts create_enum_option fields", () => {
      const result = manageCustomFieldsSchema.parse({
        operation: "create_enum_option",
        custom_field_gid: "cf1",
        enum_option_name: "High",
        enum_option_color: "dark-red",
      });
      expect(result.enum_option_name).toBe("High");
      expect(result.enum_option_color).toBe("dark-red");
    });
  });

  describe("managePortfoliosSchema", () => {
    it("requires operation", () => {
      expect(() => managePortfoliosSchema.parse({})).toThrow();
    });

    it.each([
      "list",
      "get",
      "create",
      "update",
      "delete",
      "list_items",
      "add_item",
      "remove_item",
    ] as const)("accepts operation '%s'", (operation) => {
      const result = managePortfoliosSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    });

    it("rejects invalid operation", () => {
      expect(() =>
        managePortfoliosSchema.parse({ operation: "archive" })
      ).toThrow();
    });

    it("accepts create fields", () => {
      const result = managePortfoliosSchema.parse({
        operation: "create",
        workspace: "ws1",
        name: "Q1 Portfolio",
        color: "dark-blue",
        public: true,
      });
      expect(result.name).toBe("Q1 Portfolio");
      expect(result.color).toBe("dark-blue");
    });

    it("accepts add_item fields", () => {
      const result = managePortfoliosSchema.parse({
        operation: "add_item",
        portfolio_gid: "port1",
        item_gid: "proj1",
      });
      expect(result.item_gid).toBe("proj1");
    });
  });

  describe("manageAttachmentsSchema", () => {
    it("requires operation", () => {
      expect(() => manageAttachmentsSchema.parse({})).toThrow();
    });

    it.each(["list", "get", "create_url", "delete"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageAttachmentsSchema.parse({ operation });
        expect(result.operation).toBe(operation);
      }
    );

    it("rejects invalid operation", () => {
      expect(() =>
        manageAttachmentsSchema.parse({ operation: "upload" })
      ).toThrow();
    });

    it("accepts create_url fields", () => {
      const result = manageAttachmentsSchema.parse({
        operation: "create_url",
        task_gid: "t1",
        url: "https://example.com/doc.pdf",
        name: "Design Doc",
      });
      expect(result.url).toBe("https://example.com/doc.pdf");
      expect(result.name).toBe("Design Doc");
    });
  });

  describe("manageTemplatesSchema", () => {
    it("requires operation", () => {
      expect(() => manageTemplatesSchema.parse({})).toThrow();
    });

    it.each(["list", "get", "instantiate"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageTemplatesSchema.parse({ operation });
        expect(result.operation).toBe(operation);
      }
    );

    it("rejects invalid operation", () => {
      expect(() =>
        manageTemplatesSchema.parse({ operation: "delete" })
      ).toThrow();
    });

    it("accepts instantiate fields", () => {
      const result = manageTemplatesSchema.parse({
        operation: "instantiate",
        template_gid: "tmpl1",
        name: "New Project",
        team: "team1",
        public: true,
      });
      expect(result.name).toBe("New Project");
      expect(result.team).toBe("team1");
    });
  });
});

// ── Tool count ──

describe("tool count", () => {
  it("exports exactly 17 tools", () => {
    expect(ASANA_TOOLS).toHaveLength(17);
  });
});

// ── Cross-cutting: schemas with required fields reject {} ──

describe("all schemas reject empty object", () => {
  it.each([
    ["searchTasksSchema", searchTasksSchema],
    ["getTaskSchema", getTaskSchema],
    ["createTaskSchema", createTaskSchema],
    ["updateTaskSchema", updateTaskSchema],
    ["manageTaskRelationsSchema", manageTaskRelationsSchema],
    ["manageTaskDependenciesSchema", manageTaskDependenciesSchema],
    ["manageSubtasksSchema", manageSubtasksSchema],
    ["manageProjectsSchema", manageProjectsSchema],
    ["manageSectionsSchema", manageSectionsSchema],
    ["manageStoriesSchema", manageStoriesSchema],
    ["manageGoalsSchema", manageGoalsSchema],
    ["manageTagsSchema", manageTagsSchema],
    ["getContextSchema", getContextSchema],
    ["manageCustomFieldsSchema", manageCustomFieldsSchema],
    ["managePortfoliosSchema", managePortfoliosSchema],
    ["manageAttachmentsSchema", manageAttachmentsSchema],
    ["manageTemplatesSchema", manageTemplatesSchema],
  ] as const)("%s rejects {}", (_name, schema) => {
    expect(() => schema.parse({})).toThrow();
  });
});
