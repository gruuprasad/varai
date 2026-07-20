import assert from "node:assert/strict";
import test from "node:test";
import { matchingApiBehavior } from "../../src/scanners/lift/index.js";

const api = (method, path) => ({ door: { kind: "api_route", method, path } });

test("wildcard frontend paths match the endpoint shape rather than a loose subsequence", () => {
  const create = api("POST", "/api/v1/building-model/{job_id}/storeys");
  const duplicate = api("POST", "/api/v1/building-model/{job_id}/storeys/{storey_id}/duplicate");
  const clear = api("POST", "/api/v1/building-model/{job_id}/storeys/{storey_id}/clear");

  assert.equal(matchingApiBehavior({ method: "POST", path: "*/storeys" }, [create, duplicate, clear]), create);
  assert.equal(matchingApiBehavior({ method: "POST", path: "*/storeys/*/duplicate" }, [create, duplicate, clear]), duplicate);
  assert.equal(matchingApiBehavior({ method: "POST", path: "*/storeys/*" }, [create, duplicate, clear]), null,
    "an unsupported shape remains unresolved instead of picking a longer route");
});
