import { createHash, randomUUID } from "node:crypto";
import { objectStorageClient, ObjectStorageService } from "../lib/objectStorage";
import { setObjectAclPolicy } from "../lib/objectAcl";
import { FEATURE_ORDER } from "./config";
import type { Account, NativeModelRecord } from "./types";

interface Tree { left_children: number[]; right_children: number[]; split_indices: number[]; split_conditions: number[]; split_type: number[] }
export interface PortableModel { bias: number; trees: Tree[]; slope: number; intercept: number; threshold: number }
const models = new Map<string, PortableModel>();
function reject(message: string): never { throw new Error(`Modèle refusé : ${message}`); }

export function validateNativeModel(raw: string, manifest: Record<string, unknown>): PortableModel {
  if (raw.length > 3000000) reject("3 Mo maximum.");
  if (manifest.schemaVersion !== 1 || JSON.stringify(manifest.featureOrder) !== JSON.stringify(FEATURE_ORDER))
    reject("Schéma / ordre des features incompatible.");
  const hash = createHash("sha256").update(raw).digest("hex");
  if (manifest.modelHash !== hash) reject("Hash du modèle différent du manifeste.");
  if (manifest.status !== "CANDIDATE_EXTERNAL_NOT_PROMOTED") reject("Seuls les candidats externes non promus sont admis.");
  const calibration = manifest.calibration as Record<string, unknown>;
  if (calibration?.method !== "platt_logit" || !Number.isFinite(calibration.slope) || !Number.isFinite(calibration.intercept) ||
      Math.abs(Number(calibration.slope)) > 100 || Math.abs(Number(calibration.intercept)) > 100) reject("Calibration invalide.");
  const threshold = Number(manifest.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold >= 1) reject("Seuil invalide.");
  let native: any;
  try { native = JSON.parse(raw); } catch { reject("Format JSON natif requis, pickle/exécutable interdit."); }
  const learner = native?.learner;
  if (learner?.objective?.name !== "binary:logistic" || learner?.gradient_booster?.name !== "gbtree") reject("XGBoost binary:logistic gbtree uniquement.");
  if (Number(learner.learner_model_param?.num_feature) !== FEATURE_ORDER.length || Number(learner.learner_model_param?.num_class) !== 0) reject("Dimension / classes incompatibles.");
  if (learner.feature_names?.length && JSON.stringify(learner.feature_names) !== JSON.stringify(FEATURE_ORDER)) reject("Noms features incompatibles.");
  let base: number;
  try { const value = JSON.parse(learner.learner_model_param.base_score); base = Number(Array.isArray(value) ? value[0] : value); }
  catch { reject("Base score absent/invalide."); }
  if (!Number.isFinite(base!) || base! <= 0 || base! >= 1) reject("Base score doit être une probabilité.");
  const booster = learner.gradient_booster.model;
  const trees = booster?.trees as Tree[];
  if (!Array.isArray(trees) || !trees.length || trees.length > 200 || !Array.isArray(booster.tree_info) ||
      booster.tree_info.length !== trees.length || booster.tree_info.some((x: number) => x !== 0)) reject("Arbres non compatibles ou trop nombreux.");
  for (const tree of trees) {
    const n = tree.left_children?.length;
    if (!n || n > 2000 || ["right_children", "split_indices", "split_conditions", "split_type"].some(k => !Array.isArray((tree as any)[k]) || (tree as any)[k].length !== n))
      reject("Structure de l'arbre invalide.");
    const reachable = new Set<number>();
    const visit = (node: number) => {
      if (reachable.has(node)) reject("Arbre cyclique / nœud partagé.");
      reachable.add(node);
      const left = tree.left_children[node], right = tree.right_children[node], index = tree.split_indices[node], value = tree.split_conditions[node];
      if (!Number.isFinite(value) || tree.split_type[node] !== 0) reject("NaN ou split catégoriel interdit.");
      if (left === -1 && right === -1) { if (Math.abs(value) > 100) reject("Poids feuille hors borne."); return; }
      if (![left, right, index].every(Number.isInteger) || left <= node || right <= node || left >= n || right >= n ||
          index < 0 || index >= FEATURE_ORDER.length) reject("Enfant / indice feature invalide.");
      visit(left); visit(right);
    };
    visit(0);
    if (reachable.size !== n) reject("Nœud orphelin.");
  }
  return { bias: Math.log(base! / (1 - base!)), trees, slope: Number(calibration.slope), intercept: Number(calibration.intercept), threshold };
}
export function predictShadow(model: PortableModel, features: Record<string, number>): number | null {
  if (!FEATURE_ORDER.every(k => Number.isFinite(features[k]))) return null;
  const values = FEATURE_ORDER.map(k => features[k]);
  let margin = model.bias;
  for (const tree of model.trees) {
    let node = 0;
    while (tree.left_children[node] !== -1) node = values[tree.split_indices[node]] < tree.split_conditions[node] ? tree.left_children[node] : tree.right_children[node];
    margin += tree.split_conditions[node];
  }
  const rawP = Math.max(1e-6, Math.min(1 - 1e-6, 1 / (1 + Math.exp(-margin))));
  return 1 / (1 + Math.exp(-(model.slope * Math.log(rawP / (1 - rawP)) + model.intercept)));
}
function privateFile(path: string) {
  const parts = path.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error("Stockage privé mal configuré.");
  return objectStorageClient.bucket(parts.shift()!).file(parts.join("/"));
}
export async function importModel(owner: string, raw: string, manifest: Record<string, unknown>): Promise<NativeModelRecord> {
  const model = validateNativeModel(raw, manifest);
  const id = randomUUID(), hash = createHash("sha256").update(raw).digest("hex");
  const objectPath = `${new ObjectStorageService().getPrivateObjectDir()}/models/${id}.json`;
  const file = privateFile(objectPath);
  await file.save(JSON.stringify({ raw, manifest }), { contentType: "application/json", resumable: false });
  await setObjectAclPolicy(file, { owner, visibility: "private" });
  models.set(id, model);
  return { id, hash, objectPath, createdAt: new Date().toISOString(), features: FEATURE_ORDER, threshold: model.threshold, status: "SHADOW_UNVERIFIED" };
}
export async function scoreCandidate(a: Account, features: Record<string, number>): Promise<{ shadowScore: number | null; shadowModelId: string | null }> {
  const record = a.models.filter(m => m.status === "SHADOW_UNVERIFIED").at(-1);
  if (!record || !FEATURE_ORDER.every(k => Number.isFinite(features[k]))) return { shadowScore: null, shadowModelId: record?.id || null };
  let model = models.get(record.id);
  if (!model) {
    const file = privateFile(record.objectPath);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) > 5000000) throw new Error("Modèle stocké trop volumineux.");
    const [data] = await file.download(), stored = JSON.parse(data.toString());
    model = validateNativeModel(stored.raw, stored.manifest);
    models.set(record.id, model);
  }
  return { shadowScore: predictShadow(model, features), shadowModelId: record.id };
}