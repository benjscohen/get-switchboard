import { flexParse, jsonParam, jsonParamOptional } from "./json-params";

describe("flexParse", () => {
  it("returns undefined for undefined", () => {
    expect(flexParse(undefined)).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(flexParse(null)).toBeUndefined();
  });

  it("returns undefined for empty string", () => {
    expect(flexParse("")).toBeUndefined();
  });

  it("parses valid JSON string into object", () => {
    expect(flexParse('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses valid JSON string into array", () => {
    expect(flexParse('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it("throws on invalid JSON string", () => {
    expect(() => flexParse("{bad}")).toThrow("Invalid JSON string");
  });

  it("passes through a plain object", () => {
    const obj = { foo: "bar" };
    expect(flexParse(obj)).toBe(obj);
  });

  it("passes through an array", () => {
    const arr = [1, 2, 3];
    expect(flexParse(arr)).toBe(arr);
  });

  // New behavior from widened signature
  it("returns undefined for number primitive", () => {
    expect(flexParse(42)).toBeUndefined();
  });

  it("returns undefined for boolean primitive", () => {
    expect(flexParse(true)).toBeUndefined();
    expect(flexParse(false)).toBeUndefined();
  });

  it("returns undefined for symbol", () => {
    expect(flexParse(Symbol("test"))).toBeUndefined();
  });

  it("supports generic type parameter", () => {
    const result = flexParse<{ name: string }>('{"name":"test"}');
    expect(result?.name).toBe("test");
  });

  it("returns undefined when generic used with null", () => {
    const result = flexParse<string[]>(null);
    expect(result).toBeUndefined();
  });
});

describe("jsonParam", () => {
  it("accepts a string", () => {
    const schema = jsonParam("test");
    expect(schema.parse('{"a":1}')).toBe('{"a":1}');
  });

  it("accepts a plain object", () => {
    const schema = jsonParam("test");
    const obj = { a: 1 };
    expect(schema.parse(obj)).toEqual(obj);
  });

  it("accepts an array", () => {
    const schema = jsonParam("test");
    expect(schema.parse([1, 2])).toEqual([1, 2]);
  });

  it("rejects a number", () => {
    const schema = jsonParam("test");
    expect(() => schema.parse(42)).toThrow();
  });

  it("rejects undefined (required)", () => {
    const schema = jsonParam("test");
    expect(() => schema.parse(undefined)).toThrow();
  });
});

describe("jsonParamOptional", () => {
  it("accepts undefined", () => {
    const schema = jsonParamOptional("test");
    expect(schema.parse(undefined)).toBeUndefined();
  });

  it("accepts a string", () => {
    const schema = jsonParamOptional("test");
    expect(schema.parse("[]")).toBe("[]");
  });
});
