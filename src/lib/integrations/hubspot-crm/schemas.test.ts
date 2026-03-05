import {
  objectType,
  objectId,
  propertiesField,
  manageObjectsSchema,
  searchObjectsSchema,
  batchObjectsSchema,
  manageAssociationsSchema,
  mergeObjectsSchema,
  managePropertiesSchema,
  managePropertyGroupsSchema,
  manageSchemasSchema,
  getObjectSchemaSchema,
  managePipelinesSchema,
  managePipelineStagesSchema,
  manageOwnersSchema,
  manageUsersSchema,
  manageListsSchema,
  manageImportsSchema,
  manageExportsSchema,
  manageDealSplitsSchema,
  manageCallingTranscriptsSchema,
  manageMarketingEventsSchema,
  manageFeedbackSubmissionsSchema,
  manageForecastsSchema,
  manageCampaignsSchema,
  manageSequencesSchema,
} from "./schemas";
import { HUBSPOT_CRM_TOOLS } from "./tools";

// ── Shared fragments ──

describe("shared fragments", () => {
  it("objectType requires a string", () => {
    expect(() => objectType.parse(undefined)).toThrow();
    expect(objectType.parse("contacts")).toBe("contacts");
  });

  it("objectId requires a string", () => {
    expect(() => objectId.parse(undefined)).toThrow();
    expect(objectId.parse("123")).toBe("123");
  });

  it("propertiesField accepts optional string", () => {
    expect(propertiesField.parse(undefined)).toBeUndefined();
    expect(propertiesField.parse("firstname,lastname")).toBe(
      "firstname,lastname"
    );
  });
});

// ── Manage Objects ──

describe("manageObjectsSchema", () => {
  it("requires operation and object_type", () => {
    expect(() => manageObjectsSchema.parse({})).toThrow();
    expect(() =>
      manageObjectsSchema.parse({ operation: "list" })
    ).toThrow();
  });

  it.each(["get", "create", "update", "archive", "list"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageObjectsSchema.parse({
        operation,
        object_type: "contacts",
      });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageObjectsSchema.parse({ operation: "merge", object_type: "contacts" })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = manageObjectsSchema.parse({
      operation: "create",
      object_type: "contacts",
      properties: '{"firstname":"John","lastname":"Doe"}',
      associations: '[{"to":{"id":"123"},"types":[{"associationCategory":"HUBSPOT_DEFINED","associationTypeId":1}]}]',
    });
    expect(result.properties).toContain("John");
  });

  it("accepts pagination fields", () => {
    const result = manageObjectsSchema.parse({
      operation: "list",
      object_type: "deals",
      limit: 50,
      after: "abc123",
    });
    expect(result.limit).toBe(50);
    expect(result.after).toBe("abc123");
  });
});

// ── Search Objects ──

describe("searchObjectsSchema", () => {
  it("requires object_type", () => {
    expect(() => searchObjectsSchema.parse({})).toThrow();
  });

  it("accepts search fields", () => {
    const result = searchObjectsSchema.parse({
      object_type: "contacts",
      filter_groups: '[{"filters":[{"propertyName":"email","operator":"EQ","value":"test@test.com"}]}]',
      sorts: '[{"propertyName":"createdate","direction":"DESCENDING"}]',
      query: "test",
      properties: "firstname,lastname",
      limit: 20,
    });
    expect(result.object_type).toBe("contacts");
    expect(result.query).toBe("test");
  });
});

// ── Batch Objects ──

describe("batchObjectsSchema", () => {
  it("requires operation, object_type, and inputs", () => {
    expect(() => batchObjectsSchema.parse({})).toThrow();
    expect(() =>
      batchObjectsSchema.parse({ operation: "create", object_type: "contacts" })
    ).toThrow();
  });

  it.each(["create", "update", "read", "archive"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = batchObjectsSchema.parse({
        operation,
        object_type: "contacts",
        inputs: '[{"properties":{"email":"test@test.com"}}]',
      });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      batchObjectsSchema.parse({
        operation: "delete",
        object_type: "contacts",
        inputs: "[]",
      })
    ).toThrow();
  });
});

// ── Manage Associations ──

describe("manageAssociationsSchema", () => {
  it("requires operation, from_object_type, from_object_id, to_object_type", () => {
    expect(() => manageAssociationsSchema.parse({})).toThrow();
    expect(() =>
      manageAssociationsSchema.parse({ operation: "list" })
    ).toThrow();
  });

  it.each(["list", "create", "delete"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageAssociationsSchema.parse({
        operation,
        from_object_type: "contacts",
        from_object_id: "123",
        to_object_type: "companies",
      });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageAssociationsSchema.parse({
        operation: "update",
        from_object_type: "contacts",
        from_object_id: "123",
        to_object_type: "companies",
      })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = manageAssociationsSchema.parse({
      operation: "create",
      from_object_type: "contacts",
      from_object_id: "123",
      to_object_type: "companies",
      to_object_id: "456",
      association_type_id: 1,
    });
    expect(result.to_object_id).toBe("456");
    expect(result.association_type_id).toBe(1);
  });
});

// ── Merge Objects ──

describe("mergeObjectsSchema", () => {
  it("requires all fields", () => {
    expect(() => mergeObjectsSchema.parse({})).toThrow();
    expect(() =>
      mergeObjectsSchema.parse({ object_type: "contacts" })
    ).toThrow();
  });

  it("accepts valid merge input", () => {
    const result = mergeObjectsSchema.parse({
      object_type: "contacts",
      primary_object_id: "123",
      object_id_to_merge: "456",
    });
    expect(result.primary_object_id).toBe("123");
    expect(result.object_id_to_merge).toBe("456");
  });
});

// ── Manage Properties ──

describe("managePropertiesSchema", () => {
  it("requires operation and object_type", () => {
    expect(() => managePropertiesSchema.parse({})).toThrow();
    expect(() =>
      managePropertiesSchema.parse({ operation: "list" })
    ).toThrow();
  });

  it.each(["list", "get", "create", "update", "archive"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = managePropertiesSchema.parse({
        operation,
        object_type: "contacts",
      });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      managePropertiesSchema.parse({
        operation: "delete",
        object_type: "contacts",
      })
    ).toThrow();
  });

  it.each([
    "string",
    "number",
    "date",
    "datetime",
    "enumeration",
    "bool",
  ] as const)("accepts type '%s'", (type) => {
    const result = managePropertiesSchema.parse({
      operation: "create",
      object_type: "contacts",
      type,
    });
    expect(result.type).toBe(type);
  });

  it("rejects invalid type", () => {
    expect(() =>
      managePropertiesSchema.parse({
        operation: "create",
        object_type: "contacts",
        type: "array",
      })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = managePropertiesSchema.parse({
      operation: "create",
      object_type: "contacts",
      name: "favorite_color",
      label: "Favorite Color",
      type: "enumeration",
      field_type: "select",
      group_name: "contactinformation",
      description: "The contact's favorite color",
      options: '[{"label":"Red","value":"red"},{"label":"Blue","value":"blue"}]',
    });
    expect(result.name).toBe("favorite_color");
    expect(result.label).toBe("Favorite Color");
  });
});

// ── Manage Property Groups ──

describe("managePropertyGroupsSchema", () => {
  it("requires operation and object_type", () => {
    expect(() => managePropertyGroupsSchema.parse({})).toThrow();
    expect(() =>
      managePropertyGroupsSchema.parse({ operation: "list" })
    ).toThrow();
  });

  it.each(["list", "get", "create", "update", "archive"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = managePropertyGroupsSchema.parse({
        operation,
        object_type: "contacts",
      });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      managePropertyGroupsSchema.parse({
        operation: "delete",
        object_type: "contacts",
      })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = managePropertyGroupsSchema.parse({
      operation: "create",
      object_type: "contacts",
      name: "custom_group",
      label: "Custom Group",
      display_order: 5,
    });
    expect(result.name).toBe("custom_group");
    expect(result.display_order).toBe(5);
  });
});

// ── Manage Schemas ──

describe("manageSchemasSchema", () => {
  it("requires operation", () => {
    expect(() => manageSchemasSchema.parse({})).toThrow();
  });

  it.each(["list", "get", "create", "update", "archive"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageSchemasSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageSchemasSchema.parse({ operation: "delete" })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = manageSchemasSchema.parse({
      operation: "create",
      name: "cars",
      labels: '{"singular":"Car","plural":"Cars"}',
      properties: '[{"name":"make","label":"Make","type":"string","fieldType":"text"}]',
      required_properties: '["make"]',
      primary_display_property: "make",
      secondary_display_properties: '["model"]',
    });
    expect(result.name).toBe("cars");
  });
});

// ── Get Object Schema ──

describe("getObjectSchemaSchema", () => {
  it("requires object_type", () => {
    expect(() => getObjectSchemaSchema.parse({})).toThrow();
  });

  it("accepts valid input", () => {
    const result = getObjectSchemaSchema.parse({ object_type: "contacts" });
    expect(result.object_type).toBe("contacts");
  });
});

// ── Manage Pipelines ──

describe("managePipelinesSchema", () => {
  it("requires operation and object_type", () => {
    expect(() => managePipelinesSchema.parse({})).toThrow();
    expect(() =>
      managePipelinesSchema.parse({ operation: "list" })
    ).toThrow();
  });

  it.each(["list", "get", "create", "update", "archive"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = managePipelinesSchema.parse({
        operation,
        object_type: "deals",
      });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      managePipelinesSchema.parse({
        operation: "delete",
        object_type: "deals",
      })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = managePipelinesSchema.parse({
      operation: "create",
      object_type: "deals",
      label: "Sales Pipeline",
      display_order: 1,
      stages: '[{"label":"Qualification","displayOrder":0}]',
    });
    expect(result.label).toBe("Sales Pipeline");
  });
});

// ── Manage Pipeline Stages ──

describe("managePipelineStagesSchema", () => {
  it("requires operation, object_type, and pipeline_id", () => {
    expect(() => managePipelineStagesSchema.parse({})).toThrow();
    expect(() =>
      managePipelineStagesSchema.parse({ operation: "list" })
    ).toThrow();
    expect(() =>
      managePipelineStagesSchema.parse({
        operation: "list",
        object_type: "deals",
      })
    ).toThrow();
  });

  it.each(["list", "get", "create", "update", "archive"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = managePipelineStagesSchema.parse({
        operation,
        object_type: "deals",
        pipeline_id: "p1",
      });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      managePipelineStagesSchema.parse({
        operation: "delete",
        object_type: "deals",
        pipeline_id: "p1",
      })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = managePipelineStagesSchema.parse({
      operation: "create",
      object_type: "deals",
      pipeline_id: "p1",
      label: "Qualification",
      display_order: 0,
      metadata: '{"probability":0.2}',
    });
    expect(result.label).toBe("Qualification");
  });
});

// ── Manage Owners ──

describe("manageOwnersSchema", () => {
  it("requires operation", () => {
    expect(() => manageOwnersSchema.parse({})).toThrow();
  });

  it.each(["list", "get"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageOwnersSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageOwnersSchema.parse({ operation: "create" })
    ).toThrow();
  });

  it("accepts list with email filter", () => {
    const result = manageOwnersSchema.parse({
      operation: "list",
      email: "test@example.com",
      limit: 10,
    });
    expect(result.email).toBe("test@example.com");
  });
});

// ── Manage Users ──

describe("manageUsersSchema", () => {
  it("requires operation", () => {
    expect(() => manageUsersSchema.parse({})).toThrow();
  });

  it.each(["list", "get"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageUsersSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageUsersSchema.parse({ operation: "create" })
    ).toThrow();
  });

  it("accepts get with user_id", () => {
    const result = manageUsersSchema.parse({
      operation: "get",
      user_id: "u1",
    });
    expect(result.user_id).toBe("u1");
  });
});

// ── Manage Lists ──

describe("manageListsSchema", () => {
  it("requires operation", () => {
    expect(() => manageListsSchema.parse({})).toThrow();
  });

  it.each([
    "get",
    "create",
    "update",
    "delete",
    "search",
    "add_members",
    "remove_members",
  ] as const)("accepts operation '%s'", (operation) => {
    const result = manageListsSchema.parse({ operation });
    expect(result.operation).toBe(operation);
  });

  it("rejects invalid operation", () => {
    expect(() =>
      manageListsSchema.parse({ operation: "archive" })
    ).toThrow();
  });

  it.each(["MANUAL", "DYNAMIC"] as const)(
    "accepts processing_type '%s'",
    (processing_type) => {
      const result = manageListsSchema.parse({
        operation: "create",
        processing_type,
      });
      expect(result.processing_type).toBe(processing_type);
    }
  );

  it("rejects invalid processing_type", () => {
    expect(() =>
      manageListsSchema.parse({
        operation: "create",
        processing_type: "STATIC",
      })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = manageListsSchema.parse({
      operation: "create",
      name: "VIP Contacts",
      object_type_id: "0-1",
      processing_type: "MANUAL",
    });
    expect(result.name).toBe("VIP Contacts");
    expect(result.object_type_id).toBe("0-1");
  });

  it("accepts add_members fields", () => {
    const result = manageListsSchema.parse({
      operation: "add_members",
      list_id: "list1",
      record_ids: '["123","456"]',
    });
    expect(result.record_ids).toContain("123");
  });
});

// ── Manage Imports ──

describe("manageImportsSchema", () => {
  it("requires operation", () => {
    expect(() => manageImportsSchema.parse({})).toThrow();
  });

  it.each(["start", "get", "cancel"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageImportsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageImportsSchema.parse({ operation: "delete" })
    ).toThrow();
  });

  it("accepts start fields", () => {
    const result = manageImportsSchema.parse({
      operation: "start",
      import_name: "Q1 Contacts",
      files: '[{"fileName":"contacts.csv","fileFormat":"CSV"}]',
    });
    expect(result.import_name).toBe("Q1 Contacts");
  });
});

// ── Manage Exports ──

describe("manageExportsSchema", () => {
  it("requires operation", () => {
    expect(() => manageExportsSchema.parse({})).toThrow();
  });

  it.each(["start", "get"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageExportsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageExportsSchema.parse({ operation: "cancel" })
    ).toThrow();
  });

  it("accepts start fields", () => {
    const result = manageExportsSchema.parse({
      operation: "start",
      object_type: "contacts",
      properties: '["firstname","lastname","email"]',
      filter: '{"propertyName":"createdate","operator":"GTE","value":"2024-01-01"}',
    });
    expect(result.object_type).toBe("contacts");
  });
});

// ── Manage Deal Splits ──

describe("manageDealSplitsSchema", () => {
  it("requires operation and deal_id", () => {
    expect(() => manageDealSplitsSchema.parse({})).toThrow();
    expect(() =>
      manageDealSplitsSchema.parse({ operation: "get" })
    ).toThrow();
  });

  it.each(["get", "set"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageDealSplitsSchema.parse({
        operation,
        deal_id: "d1",
      });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageDealSplitsSchema.parse({
        operation: "delete",
        deal_id: "d1",
      })
    ).toThrow();
  });

  it("accepts set fields", () => {
    const result = manageDealSplitsSchema.parse({
      operation: "set",
      deal_id: "d1",
      splits: '[{"ownerId":"o1","percentage":50}]',
    });
    expect(result.splits).toContain("o1");
  });
});

// ── Manage Calling Transcripts ──

describe("manageCallingTranscriptsSchema", () => {
  it("requires operation", () => {
    expect(() => manageCallingTranscriptsSchema.parse({})).toThrow();
  });

  it.each(["list", "get"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageCallingTranscriptsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageCallingTranscriptsSchema.parse({ operation: "create" })
    ).toThrow();
  });

  it("accepts get with transcript_id", () => {
    const result = manageCallingTranscriptsSchema.parse({
      operation: "get",
      transcript_id: "t1",
    });
    expect(result.transcript_id).toBe("t1");
  });
});

// ── Manage Marketing Events ──

describe("manageMarketingEventsSchema", () => {
  it("requires operation", () => {
    expect(() => manageMarketingEventsSchema.parse({})).toThrow();
  });

  it.each(["get", "create", "update", "delete", "list"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageMarketingEventsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageMarketingEventsSchema.parse({ operation: "archive" })
    ).toThrow();
  });

  it("accepts create fields", () => {
    const result = manageMarketingEventsSchema.parse({
      operation: "create",
      event_name: "Webinar 2024",
      event_type: "WEBINAR",
      start_date_time: "2024-06-01T10:00:00Z",
      end_date_time: "2024-06-01T11:00:00Z",
      event_organizer: "Marketing Team",
      event_description: "Monthly webinar",
      custom_properties: '{"topic":"AI"}',
    });
    expect(result.event_name).toBe("Webinar 2024");
  });
});

// ── Manage Feedback Submissions ──

describe("manageFeedbackSubmissionsSchema", () => {
  it("requires operation", () => {
    expect(() => manageFeedbackSubmissionsSchema.parse({})).toThrow();
  });

  it.each(["list", "get"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageFeedbackSubmissionsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageFeedbackSubmissionsSchema.parse({ operation: "create" })
    ).toThrow();
  });

  it("accepts get with submission_id", () => {
    const result = manageFeedbackSubmissionsSchema.parse({
      operation: "get",
      submission_id: "fs1",
    });
    expect(result.submission_id).toBe("fs1");
  });
});

// ── Manage Forecasts ──

describe("manageForecastsSchema", () => {
  it("requires operation, forecast_type, period_year, period_month, pipeline_id", () => {
    expect(() => manageForecastsSchema.parse({})).toThrow();
    expect(() =>
      manageForecastsSchema.parse({ operation: "get" })
    ).toThrow();
  });

  it.each(["DEAL", "REVENUE"] as const)(
    "accepts forecast_type '%s'",
    (forecast_type) => {
      const result = manageForecastsSchema.parse({
        operation: "get",
        forecast_type,
        period_year: 2024,
        period_month: 6,
        pipeline_id: "p1",
      });
      expect(result.forecast_type).toBe(forecast_type);
    }
  );

  it("rejects invalid forecast_type", () => {
    expect(() =>
      manageForecastsSchema.parse({
        operation: "get",
        forecast_type: "PIPELINE",
        period_year: 2024,
        period_month: 6,
        pipeline_id: "p1",
      })
    ).toThrow();
  });

  it("accepts valid forecast request", () => {
    const result = manageForecastsSchema.parse({
      operation: "get",
      forecast_type: "DEAL",
      period_year: 2024,
      period_month: 6,
      pipeline_id: "p1",
      user_id: "u1",
    });
    expect(result.period_year).toBe(2024);
    expect(result.user_id).toBe("u1");
  });
});

// ── Manage Campaigns ──

describe("manageCampaignsSchema", () => {
  it("requires operation", () => {
    expect(() => manageCampaignsSchema.parse({})).toThrow();
  });

  it.each(["list", "get", "get_revenue"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageCampaignsSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageCampaignsSchema.parse({ operation: "create" })
    ).toThrow();
  });

  it("accepts get with campaign_id", () => {
    const result = manageCampaignsSchema.parse({
      operation: "get",
      campaign_id: "c1",
    });
    expect(result.campaign_id).toBe("c1");
  });

  it("accepts pagination fields", () => {
    const result = manageCampaignsSchema.parse({
      operation: "list",
      limit: 25,
      after: "cursor1",
    });
    expect(result.limit).toBe(25);
    expect(result.after).toBe("cursor1");
  });
});

// ── Manage Sequences ──

describe("manageSequencesSchema", () => {
  it("requires operation", () => {
    expect(() => manageSequencesSchema.parse({})).toThrow();
  });

  it.each(["list", "get", "enroll"] as const)(
    "accepts operation '%s'",
    (operation) => {
      const result = manageSequencesSchema.parse({ operation });
      expect(result.operation).toBe(operation);
    }
  );

  it("rejects invalid operation", () => {
    expect(() =>
      manageSequencesSchema.parse({ operation: "create" })
    ).toThrow();
  });

  it("accepts enroll fields", () => {
    const result = manageSequencesSchema.parse({
      operation: "enroll",
      sequence_id: "seq1",
      contact_id: "c1",
      sender_email: "user@example.com",
    });
    expect(result.sequence_id).toBe("seq1");
    expect(result.contact_id).toBe("c1");
    expect(result.sender_email).toBe("user@example.com");
  });

  it("accepts pagination fields", () => {
    const result = manageSequencesSchema.parse({
      operation: "list",
      limit: 10,
      after: "cursor2",
    });
    expect(result.limit).toBe(10);
    expect(result.after).toBe("cursor2");
  });
});

// ── Tool count ──

describe("tool count", () => {
  it("exports exactly 23 tools", () => {
    expect(HUBSPOT_CRM_TOOLS).toHaveLength(23);
  });
});

// ── Cross-cutting: schemas with required fields reject {} ──

describe("all schemas with required fields reject empty object", () => {
  it.each([
    ["manageObjectsSchema", manageObjectsSchema],
    ["searchObjectsSchema", searchObjectsSchema],
    ["batchObjectsSchema", batchObjectsSchema],
    ["manageAssociationsSchema", manageAssociationsSchema],
    ["mergeObjectsSchema", mergeObjectsSchema],
    ["managePropertiesSchema", managePropertiesSchema],
    ["managePropertyGroupsSchema", managePropertyGroupsSchema],
    ["manageSchemasSchema", manageSchemasSchema],
    ["getObjectSchemaSchema", getObjectSchemaSchema],
    ["managePipelinesSchema", managePipelinesSchema],
    ["managePipelineStagesSchema", managePipelineStagesSchema],
    ["manageOwnersSchema", manageOwnersSchema],
    ["manageUsersSchema", manageUsersSchema],
    ["manageListsSchema", manageListsSchema],
    ["manageImportsSchema", manageImportsSchema],
    ["manageExportsSchema", manageExportsSchema],
    ["manageDealSplitsSchema", manageDealSplitsSchema],
    ["manageCallingTranscriptsSchema", manageCallingTranscriptsSchema],
    ["manageMarketingEventsSchema", manageMarketingEventsSchema],
    ["manageFeedbackSubmissionsSchema", manageFeedbackSubmissionsSchema],
    ["manageForecastsSchema", manageForecastsSchema],
    ["manageCampaignsSchema", manageCampaignsSchema],
    ["manageSequencesSchema", manageSequencesSchema],
  ] as const)("%s rejects {}", (_name, schema) => {
    expect(() => schema.parse({})).toThrow();
  });
});
