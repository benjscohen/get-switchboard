import { describe, it, expect } from "vitest";
import { jsonSchemaToZodToolSchema } from "./json-schema-to-zod";

describe("jsonSchemaToZodToolSchema", () => {
  describe("string coercion", () => {
    const schema = jsonSchemaToZodToolSchema({
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    });

    it("accepts strings", () => {
      expect(schema.parse({ id: "hello" })).toEqual({ id: "hello" });
    });

    it("coerces numbers to strings", () => {
      expect(schema.parse({ id: 3908402209 })).toEqual({ id: "3908402209" });
    });

    it("coerces booleans to strings", () => {
      expect(schema.parse({ id: true })).toEqual({ id: "true" });
    });
  });

  describe("number coercion", () => {
    const schema = jsonSchemaToZodToolSchema({
      type: "object",
      properties: { count: { type: "number" } },
      required: ["count"],
    });

    it("accepts numbers", () => {
      expect(schema.parse({ count: 42 })).toEqual({ count: 42 });
    });

    it("coerces numeric strings to numbers", () => {
      expect(schema.parse({ count: "42" })).toEqual({ count: 42 });
    });

    it("rejects non-numeric strings", () => {
      expect(() => schema.parse({ count: "abc" })).toThrow();
    });
  });

  describe("integer coercion", () => {
    const schema = jsonSchemaToZodToolSchema({
      type: "object",
      properties: { count: { type: "integer" } },
      required: ["count"],
    });

    it("coerces numeric strings to numbers", () => {
      expect(schema.parse({ count: "7" })).toEqual({ count: 7 });
    });
  });

  describe("boolean stays strict", () => {
    const schema = jsonSchemaToZodToolSchema({
      type: "object",
      properties: { flag: { type: "boolean" } },
      required: ["flag"],
    });

    it("accepts booleans", () => {
      expect(schema.parse({ flag: true })).toEqual({ flag: true });
    });

    it("rejects strings", () => {
      expect(() => schema.parse({ flag: "true" })).toThrow();
    });

    it("rejects numbers", () => {
      expect(() => schema.parse({ flag: 1 })).toThrow();
    });
  });

  describe("mixed types object", () => {
    const schema = jsonSchemaToZodToolSchema({
      type: "object",
      properties: {
        id: { type: "string" },
        count: { type: "number" },
        active: { type: "boolean" },
      },
      required: ["id", "count", "active"],
    });

    it("coerces id and count but keeps boolean strict", () => {
      expect(schema.parse({ id: 123, count: "5", active: false })).toEqual({
        id: "123",
        count: 5,
        active: false,
      });
    });
  });

  describe("nested objects", () => {
    const schema = jsonSchemaToZodToolSchema({
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: {
            id: { type: "string" },
            value: { type: "number" },
          },
          required: ["id"],
        },
      },
      required: ["nested"],
    });

    it("coerces inside nested objects", () => {
      expect(schema.parse({ nested: { id: 999, value: "10" } })).toEqual({
        nested: { id: "999", value: 10 },
      });
    });
  });

  describe("arrays", () => {
    const schema = jsonSchemaToZodToolSchema({
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
      },
      required: ["ids"],
    });

    it("coerces array items", () => {
      expect(schema.parse({ ids: [1, 2, 3] })).toEqual({
        ids: ["1", "2", "3"],
      });
    });
  });

  describe("optional fields", () => {
    const schema = jsonSchemaToZodToolSchema({
      type: "object",
      properties: { name: { type: "string" } },
    });

    it("accepts missing optional fields", () => {
      expect(schema.parse({})).toEqual({});
    });
  });
});
