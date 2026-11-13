import { useEffect, useMemo, useState } from "react";
import {
  createDocument,
  importDocument,
  loadDocument,
  STORAGE_KEY,
  validateDocument,
} from "./data";
import { changeSettings, equal, snapshotAt } from "./engine/timeline";
import { monthKey } from "./engine/calendar";
import type { PlanDocument, SettingsKey, Simulation } from "./engine/types";
export { defaults, HORIZONS, restore } from "./legacy";
export { STORAGE_KEY, LEGACY_STORAGE_KEY } from "./data";

export function useSimulation(month: string) {
  const [loaded] = useState(() => {
    try {
      return { document: loadDocument(localStorage), valid: true };
    } catch {
      return { document: createDocument(), valid: false };
    }
  });
  const [document, setDocument] = useState(loaded.document);
  const [canPersist, setCanPersist] = useState(loaded.valid);
  const [storageOk, setStorageOk] = useState(loaded.valid);
  const [pending, setPending] = useState<Partial<Simulation>>({});
  const [effectiveMonth, setEffectiveMonth] = useState(month);
  const [error, setError] = useState("");
  const confirmed = useMemo(
    () => snapshotAt(document, month),
    [document, month],
  );
  const state = useMemo(
    () => ({ ...confirmed, ...pending }),
    [confirmed, pending],
  );
  const preview = useMemo(
    () =>
      Object.keys(pending).length
        ? changeSettings(document, pending, effectiveMonth)
        : document,
    [document, pending, effectiveMonth],
  );
  const dirty = Object.entries(pending).some(
    ([key, value]) =>
      !equal(value, snapshotAt(document, effectiveMonth)[key as SettingsKey]),
  );
  function commit(next: PlanDocument) {
    try {
      validateDocument(next);
      setDocument(next);
      setCanPersist(true);
      setError("");
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível confirmar a alteração.",
      );
      return false;
    }
  }
  function update<K extends SettingsKey>(key: K, value: Simulation[K]) {
    if (key === "horizon" || key === "emergencyMonths") {
      commit(changeSettings(document, { [key]: value }, null));
      return;
    }
    if (!dirty) setEffectiveMonth(month);
    setPending((previous) => ({ ...previous, [key]: value }));
  }
  function confirm() {
    if (commit(changeSettings(document, pending, effectiveMonth))) {
      setPending({});
      setEffectiveMonth(month);
    }
  }
  function discard() {
    setPending({});
    setEffectiveMonth(month);
    setError("");
  }
  function replace(incoming: PlanDocument) {
    if (commit(importDocument(document, incoming))) discard();
  }
  useEffect(() => {
    if (!canPersist) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
      setStorageOk(true);
    } catch {
      setStorageOk(false);
    }
  }, [document, canPersist]);
  return {
    document,
    state,
    confirmed,
    preview,
    dirty,
    update,
    confirm,
    discard,
    commit,
    replace,
    effectiveMonth,
    setEffectiveMonth,
    storageOk,
    error,
  };
}

export function useCurrentMonth() {
  const [month, setMonth] = useState(() => monthKey());
  useEffect(() => {
    const refresh = () => setMonth(monthKey());
    const interval = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return month;
}
