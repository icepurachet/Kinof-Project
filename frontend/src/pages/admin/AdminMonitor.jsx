import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Ban, Check, Download, Globe2, Monitor, RefreshCw, Search, ShieldCheck, Users, X } from "lucide-react";
import Button from "../../components/Button";
import Card from "../../components/Card";
import Pill from "../../components/Pill";
import { NAVY } from "../../theme";
import {
  addProgramAllowlist,
  addProgramBlacklist,
  addWebsiteBlacklist,
  bangkokDate,
  blockFlaggedActivity,
  clearFlaggedActivity,
  getBehaviorReviews,
  getProgramAllowlist,
  getProgramBlacklist,
  getTrackingActivity,
  getTrackingRooms,
  getTrackingSummary,
  getUnknownPrograms,
  getWebsiteBlacklist,
  getWebsiteBlacklistCategories,
  importWebsiteBlacklistCategory,
  removeProgramAllowlist,
  removeProgramBlacklist,
  removeWebsiteBlacklist,
  removeWebsiteBlacklistCategory,
} from "../../api/tracking";

const POLL_INTERVAL_MS = 30000;

const TABS = [
  { key: "session", label: "เข้า-ออก" },
  { key: "program", label: "โปรแกรม" },
  { key: "website", label: "เว็บไซต์" },
  { key: "flagged", label: "น่าสงสัย" },
  { key: "unknown", label: "ไม่รู้จัก" },
  { key: "blacklist", label: "บล็อกเว็บ" },
  { key: "program-blacklist", label: "บล็อกโปรแกรม" },
  { key: "program-allowlist", label: "อนุญาตโปรแกรม" },
];

const LIST_TABS = new Set(["blacklist", "program-blacklist", "program-allowlist"]);
const REVIEW_TAB = "flagged";
const UNKNOWN_TAB = "unknown";
const TAB_STORAGE_KEY = "kinofMonitorTab";
const VALID_TABS = new Set(TABS.map((item) => item.key));

const readStoredTab = () => {
  const stored = sessionStorage.getItem(TAB_STORAGE_KEY);
  return VALID_TABS.has(stored) ? stored : "session";
};

const queueKeyOf = (row) => {
  const user = row.userId ? String(row.userId).replaceAll("-", "").toLowerCase() : "anon";
  const kind = row.kind || (row.website ? "website" : row.program ? "program" : "suspicious");
  const target = String(row.target || row.website || row.program || row.activity || "").trim().toLowerCase();
  return row.queueKey || `${user}:${kind}:${target}`;
};

const normalizeDomain = (value) => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, "")
  .replace(/\/.*$/, "");

const isWebsiteBlocked = (website, domains) => {
  const domain = normalizeDomain(website);
  if (!domain) return false;
  if (domains.has(domain)) return true;
  if (domain.startsWith("www.") && domains.has(domain.slice(4))) return true;
  return domains.has(`www.${domain}`);
};

const targetKeyOf = (row) => {
  const kind = row.kind || (row.website ? "website" : row.program ? "program" : "suspicious");
  const target = String(row.target || row.website || row.program || row.activity || "").trim().toLowerCase();
  return `${kind}:${target}`;
};

const targetKeyFromQueue = (queueKey) => {
  const parts = String(queueKey || "").split(":");
  return parts.length >= 3 ? parts.slice(1).join(":") : "";
};

const isClearedTarget = (row, cleared) => {
  if (cleared.has(queueKeyOf(row))) return true;
  const targetKey = targetKeyOf(row);
  for (const key of cleared) {
    if (targetKeyFromQueue(key) === targetKey) return true;
  }
  return false;
};

const isProgramBlocked = (program, blocked) => matchesBlockedProgram(program, blocked);

const isBlockedTarget = (row, domains, programs) => {
  const website = row.website || (row.kind === "website" ? row.target : null);
  const program = row.program || (row.kind === "program" ? row.target : null);
  return isWebsiteBlocked(website, domains) || isProgramBlocked(program, programs);
};

const rowKey = (row) => queueKeyOf(row);

const activityToReviewRow = (row) => {
  const mapped = {
    id: `activity:${row.id}`,
    userId: row.userId,
    user: row.user,
    roomId: row.roomId,
    seatId: row.seatId,
    roomName: row.roomName,
    seatLabel: row.seatLabel,
    kind: row.website ? "website" : row.program ? "program" : "suspicious",
    target: row.website || row.program || row.activity,
    activity: row.activity,
    occurrenceCount: 1,
    lastSeenAt: row.at,
    website: row.website,
    program: row.program,
    activityType: row.activityType,
  };
  return { ...mapped, queueKey: queueKeyOf(mapped) };
};

const blockPayload = (row) => ({
  userId: row.userId,
  displayName: row.user?.displayName,
  username: row.user?.username,
  roomId: row.roomId,
  seatId: row.seatId,
  roomName: row.roomName,
  seatLabel: row.seatLabel,
  eventType: row.activityType || row.kind,
  website: row.website || (row.kind === "website" ? row.target : undefined),
  program: row.program || (row.kind === "program" ? row.target : undefined),
  activity: row.activity,
});

const matchesBlockedProgram = (program, blocked) => {
  if (!program) return false;
  const raw = String(program).trim().toLowerCase().replaceAll("/", "\\");
  const name = raw.includes("\\") ? raw.slice(raw.lastIndexOf("\\") + 1) : raw;
  const withExe = name.endsWith(".exe") ? name : `${name}.exe`;
  return blocked.has(name) || blocked.has(withExe);
};

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const formatDateLabel = (isoDate) => new Date(`${isoDate}T00:00:00+07:00`).toLocaleDateString("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export default function AdminMonitor({ notify, onOpenTrackingSeat, onBadgesChanged }) {
  const today = useMemo(() => bangkokDate(), []);
  const yesterday = useMemo(() => bangkokDate(-1), []);

  const [tab, setTab] = useState(readStoredTab);
  const [roomFilter, setRoomFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(today);
  const [query, setQuery] = useState("");
  const [newSite, setNewSite] = useState("");
  const [newProgram, setNewProgram] = useState("");
  const [newAllowProgram, setNewAllowProgram] = useState("");
  const [importCategory, setImportCategory] = useState("social_networks");

  const [summary, setSummary] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [rows, setRows] = useState([]);
  const [blacklist, setBlacklist] = useState([]);
  const [programBlacklist, setProgramBlacklist] = useState([]);
  const [programAllowlist, setProgramAllowlist] = useState([]);
  const [ut1Catalog, setUt1Catalog] = useState(null);
  const [unknownRows, setUnknownRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const loadedOnceRef = useRef(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setRows([]);
    }
    try {
      const [nextSummary, nextRooms, nextBlacklist, nextPrograms, nextAllow, nextCategories] = await Promise.all([
        getTrackingSummary(),
        getTrackingRooms(),
        getWebsiteBlacklist(),
        getProgramBlacklist(),
        getProgramAllowlist(),
        getWebsiteBlacklistCategories(),
      ]);
      setSummary(nextSummary);
      setRooms(nextRooms);
      setBlacklist(nextBlacklist);
      setProgramBlacklist(nextPrograms);
      setProgramAllowlist(nextAllow);
      setUt1Catalog(nextCategories);
      const domainSet = new Set(nextBlacklist.map((item) => normalizeDomain(item.domain)).filter(Boolean));
      const programSet = new Set(nextPrograms.map((item) => String(item.processName || "").trim().toLowerCase()).filter(Boolean));
      if (tab === REVIEW_TAB) {
        const [reviewData, flagged] = await Promise.all([
          getBehaviorReviews({ roomId: roomFilter }),
          getTrackingActivity({ roomId: roomFilter, date: dateFilter, type: "flagged" }),
        ]);
        const cleared = new Set(reviewData.clearedKeys);
        const handled = new Set(reviewData.handledKeys);
        const pending = reviewData.items.filter((row) => !isBlockedTarget(row, domainSet, programSet) && !isClearedTarget(row, cleared));
        const seen = new Set(pending.map(queueKeyOf));
        const extras = flagged
          .filter((row) => row.suspicious && !isBlockedTarget(row, domainSet, programSet))
          .map(activityToReviewRow)
          .filter((row) => {
            const key = queueKeyOf(row);
            if (seen.has(key)) return false;
            const siteOrApp = row.kind === "website" || row.kind === "program";
            if (siteOrApp) {
              if (isClearedTarget(row, cleared)) return false;
            } else if (cleared.size > 0 ? isClearedTarget(row, cleared) : handled.has(key)) {
              return false;
            }
            seen.add(key);
            return true;
          });
        setRows([...pending, ...extras]);
        setUnknownRows([]);
      } else if (tab === UNKNOWN_TAB) {
        setUnknownRows(await getUnknownPrograms({ roomId: roomFilter, date: dateFilter }));
        setRows([]);
      } else if (!LIST_TABS.has(tab)) {
        setRows(await getTrackingActivity({ roomId: roomFilter, date: dateFilter, type: tab }));
        setUnknownRows([]);
      } else {
        setRows([]);
        setUnknownRows([]);
      }
      setError("");
      loadedOnceRef.current = true;
    } catch (loadError) {
      if (!silent || !loadedOnceRef.current) setError(loadError.message);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tab, roomFilter, dateFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => load({ silent: true }), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const blacklistDomains = useMemo(
    () => new Set(blacklist.map((item) => normalizeDomain(item.domain)).filter(Boolean)),
    [blacklist],
  );

  const blockedPrograms = useMemo(
    () => new Set(programBlacklist.map((item) => String(item.processName || "").trim().toLowerCase()).filter(Boolean)),
    [programBlacklist],
  );

  const needle = query.trim().toLowerCase();
  const matchText = (...values) => {
    if (!needle) return true;
    return values.some((value) => String(value || "").toLowerCase().includes(needle));
  };
  const filteredBlacklist = blacklist.filter((entry) =>
    entry.source !== "ut1" && matchText(entry.domain, entry.category, entry.source),
  );
  const filteredProgramBlacklist = programBlacklist.filter((entry) =>
    matchText(entry.processName, entry.category),
  );
  const filteredProgramAllowlist = programAllowlist.filter((entry) =>
    matchText(entry.processName, entry.displayName, entry.category),
  );
  const filteredRows = rows.filter((row) =>
    matchText(
      row.user?.displayName,
      row.username,
      row.roomName,
      row.seatLabel,
      row.activity,
      row.target,
      row.kind,
      row.website,
      row.program,
    ),
  );
  const filteredUnknownRows = unknownRows.filter((row) => matchText(row.processName));

  const addToBlacklist = async (domain, category = "other") => {
    const value = domain?.trim().toLowerCase();
    if (!value) return;
    if (blacklistDomains.has(value)) {
      notify?.(`${value} อยู่ใน Blacklist แล้ว`);
      return;
    }
    setBusyId("blacklist");
    try {
      await addWebsiteBlacklist({ domain: value, category });
      await load({ silent: true });
      notify?.(`เพิ่ม ${value} ใน Blacklist แล้ว`);
    } catch (addError) {
      notify?.(addError.message);
    } finally {
      setBusyId("");
    }
  };

  const removeFromBlacklist = async (entry) => {
    setBusyId(entry.id);
    try {
      await removeWebsiteBlacklist(entry.id);
      await load({ silent: true });
      notify?.(`นำ ${entry.domain} ออกจากรายการบล็อกเว็บแล้ว`);
    } catch (removeError) {
      notify?.(removeError.message);
    } finally {
      setBusyId("");
    }
  };

  const addToProgramBlacklist = async (processName, category = "other") => {
    const value = processName?.trim();
    if (!value) return;
    setBusyId("program-blacklist");
    try {
      const added = await addProgramBlacklist({ processName: value, category });
      await load({ silent: true });
      notify?.(`เพิ่ม ${added.processName} ในรายการบล็อกโปรแกรมแล้ว`);
    } catch (addError) {
      notify?.(addError.message);
    } finally {
      setBusyId("");
    }
  };

  const removeFromProgramBlacklist = async (entry) => {
    setBusyId(entry.id);
    try {
      await removeProgramBlacklist(entry.id);
      await load({ silent: true });
      notify?.(`นำ ${entry.processName} ออกจากรายการบล็อกโปรแกรมแล้ว`);
    } catch (removeError) {
      notify?.(removeError.message);
    } finally {
      setBusyId("");
    }
  };

  const addToProgramAllowlist = async (processName, category = "other") => {
    const value = processName?.trim();
    if (!value) return;
    setBusyId("program-allowlist");
    try {
      const added = await addProgramAllowlist({ processName: value, category });
      await load({ silent: true });
      notify?.(`เพิ่ม ${added.processName} ในรายการอนุญาตแล้ว`);
    } catch (addError) {
      notify?.(addError.message);
    } finally {
      setBusyId("");
    }
  };

  const removeFromProgramAllowlist = async (entry) => {
    setBusyId(entry.id);
    try {
      await removeProgramAllowlist(entry.id);
      await load({ silent: true });
      notify?.(`นำ ${entry.processName} ออกจากรายการอนุญาตแล้ว`);
    } catch (removeError) {
      notify?.(removeError.message);
    } finally {
      setBusyId("");
    }
  };

  const importUt1Category = async (categoryId) => {
    const value = categoryId || importCategory;
    if (!value) return;
    setBusyId("ut1-import");
    try {
      const result = await importWebsiteBlacklistCategory({ category: value });
      await load({ silent: true });
      const extra = result.fallback ? " (ใช้รายการสำรอง เพราะดาวน์โหลด UT1 ไม่ได้)" : "";
      notify?.(`นำเข้า ${result.label || value} แล้ว ${result.importedCount} โดเมน${extra}`);
    } catch (importError) {
      notify?.(importError.message);
    } finally {
      setBusyId("");
    }
  };

  const removeUt1Category = async (categoryId) => {
    setBusyId(`ut1-${categoryId}`);
    try {
      const result = await removeWebsiteBlacklistCategory(categoryId);
      await load({ silent: true });
      notify?.(`นำหมวด ${categoryId} ออกแล้ว ${result.removed} โดเมน`);
    } catch (removeError) {
      notify?.(removeError.message);
    } finally {
      setBusyId("");
    }
  };

  const markReviewGood = async (row) => {
    const key = queueKeyOf(row);
    if (busyId) return;
    setBusyId(key);
    try {
      await clearFlaggedActivity(blockPayload(row));
      setRows((current) => current.filter((item) => queueKeyOf(item) !== key));
      await load({ silent: true });
      notify?.("ผ่านรายการนี้แล้ว — ไม่บล็อก ไม่หักคะแนน");
      onBadgesChanged?.();
    } catch (reviewError) {
      notify?.(reviewError.message);
    } finally {
      setBusyId("");
    }
  };

  const markReviewBad = async (row) => {
    const key = queueKeyOf(row);
    if (busyId) return;
    setBusyId(key);
    try {
      const result = await blockFlaggedActivity(blockPayload(row));
      setRows((current) => current.filter((item) => queueKeyOf(item) !== key));
      await load({ silent: true });
      const who = result.userName || row.user?.displayName || "ผู้ใช้";
      if (result.already) {
        notify?.(result.score != null
          ? `รายการนี้บล็อกไปแล้ว — คะแนนปัจจุบันของ ${who} คือ ${result.score}`
          : "รายการนี้บล็อกไปแล้ว ไม่หักซ้ำ");
      } else if (result.deducted) {
        notify?.(`บล็อกแล้ว — หัก ${result.points} คะแนนจาก ${who} คะแนนเหลือ ${result.score}`);
      } else {
        const blockedText = result.blocked
          ? row.kind === "program" || row.program
            ? `ขึ้นแท็บบล็อกโปรแกรมแล้ว (${result.blocked})`
            : `ขึ้นแท็บบล็อกเว็บแล้ว (${result.blocked})`
          : "บันทึกแล้ว";
        notify?.(`${blockedText} — ไม่หักคะแนน เพราะไม่ทราบผู้ใช้`);
      }
      onBadgesChanged?.();
    } catch (reviewError) {
      notify?.(reviewError.message);
    } finally {
      setBusyId("");
    }
  };

  const selectTab = (nextTab) => {
    setTab(nextTab);
    sessionStorage.setItem(TAB_STORAGE_KEY, nextTab);
    setRows([]);
  };

  return (
    <div className="w-full max-w-7xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl md:text-2xl font-bold text-ink tracking-tight">ตรวจสอบการใช้งาน</h1>
        <p className="text-xs text-muted mt-1">เว็บห้ามตามหมวด UT1 · โปรแกรมอนุญาตในแล็บ · ของไม่รู้จักรวมเป็นสรุป ไม่หักคะแนนอัตโนมัติ</p>
      </div>

      {error && (
        <Card className="p-6 mb-5 text-center">
          <p className="text-sm text-rose-700">{error}</p>
          <Button variant="secondary" size="sm" className="mt-4" icon={RefreshCw} onClick={() => load()}>
            ลองใหม่
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <Summary icon={Users} label="ผู้ใช้งานปัจจุบัน" value={summary ? `${summary.activeUsers} คน` : "-"} tone="bg-navy-50 text-navy-800" />
        <Summary icon={Monitor} label="เครื่องพร้อมใช้งาน" value={summary ? `${summary.machinesReady}/${summary.machinesTotal}` : "-"} tone="bg-teal-50 text-teal-500" />
        <Summary icon={Globe2} label="เว็บไซต์วันนี้" value={summary ? `${summary.websitesToday} รายการ` : "-"} tone="bg-blue-50 text-blue-600" />
        <Summary icon={AlertTriangle} label="รายการน่าสงสัย" value={summary ? `${summary.flaggedCount} รายการ` : "-"} tone="bg-amber-50 text-amber-600" />
      </div>

      <Card variant="flat" className="p-4 mb-5">
        <div className="flex flex-col sm:flex-row gap-3">
          <label className="flex-1 text-xs font-medium text-slate-600">
            ห้อง
            <select
              value={roomFilter}
              onChange={(event) => setRoomFilter(event.target.value)}
              className="block w-full mt-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700"
            >
              <option value="all">ทุกห้อง</option>
              {rooms.map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}
            </select>
          </label>
          {!LIST_TABS.has(tab) && (
            <label className="flex-1 text-xs font-medium text-slate-600">
              วันที่
              <select
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
                className="block w-full mt-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2.5 text-slate-700"
              >
                <option value={today}>วันนี้ ({formatDateLabel(today)})</option>
                <option value={yesterday}>เมื่อวาน ({formatDateLabel(yesterday)})</option>
                <option value="all">ทุกวันที่มีข้อมูล</option>
              </select>
            </label>
          )}
          <label className="flex-1 text-xs font-medium text-slate-600">
            ค้นหา
            <div className="relative mt-1.5">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="โดเมน โปรแกรม ผู้ใช้ หรือกิจกรรม"
                className="block w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-slate-700"
              />
            </div>
          </label>
        </div>
      </Card>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => selectTab(item.key)}
            className="shrink-0 text-xs px-3.5 py-2 rounded-xl border transition-colors"
            style={tab === item.key
              ? { background: NAVY, color: "white", borderColor: NAVY }
              : { background: "white", borderColor: "#e2e8f0", color: "#475569" }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === "blacklist" ? (
        <>
          <Ut1Import
            catalog={ut1Catalog}
            selected={importCategory}
            setSelected={setImportCategory}
            onImport={importUt1Category}
            onRemove={removeUt1Category}
            busyId={busyId}
          />
          <Blacklist
            title="บล็อกเว็บที่ใส่เอง"
            description="โดเมนที่แอดมินเพิ่มเอง — หมวดจาก UT1 อยู่ในการ์ดด้านบน ไม่เททั้งไฟล์หลายหมื่นโดเมนลง hosts"
            emptyText="ยังไม่มีโดเมนที่ใส่เอง"
            placeholder="เช่น facebook.com"
            nameKey="domain"
            entries={filteredBlacklist}
            draft={newSite}
            setDraft={setNewSite}
            onAdd={addToBlacklist}
            onRemove={removeFromBlacklist}
            busy={Boolean(busyId)}
          />
        </>
      ) : tab === "program-blacklist" ? (
        <Blacklist
          title="บล็อกโปรแกรม"
          description="รายชื่อไฟล์ .exe ที่ห้ามแล้ว เช่น discord.exe — Agent ปิด process ที่ตรงชื่อ (ไม่ปิดเครื่อง ไม่ปิดตัว Agent และไม่ปิด process ระบบ Windows)"
          emptyText="ยังไม่มีโปรแกรมในรายการบล็อก"
          placeholder="เช่น discord.exe"
          nameKey="processName"
          entries={filteredProgramBlacklist}
          draft={newProgram}
          setDraft={setNewProgram}
          onAdd={addToProgramBlacklist}
          onRemove={removeFromProgramBlacklist}
          busy={Boolean(busyId)}
        />
      ) : tab === "program-allowlist" ? (
        <Allowlist
          entries={filteredProgramAllowlist}
          draft={newAllowProgram}
          setDraft={setNewAllowProgram}
          onAdd={addToProgramAllowlist}
          onRemove={removeFromProgramAllowlist}
          busy={Boolean(busyId)}
        />
      ) : tab === UNKNOWN_TAB ? (
        <UnknownTable
          rows={filteredUnknownRows}
          loading={loading}
          busyId={busyId}
          onAllow={addToProgramAllowlist}
          onBlock={addToProgramBlacklist}
        />
      ) : tab === REVIEW_TAB ? (
        <ReviewTable
          rows={filteredRows}
          loading={loading}
          busyId={busyId}
          onOpenTrackingSeat={onOpenTrackingSeat}
          onMarkGood={markReviewGood}
          onMarkBad={markReviewBad}
        />
      ) : (
        <ActivityTable
          rows={filteredRows}
          tab={tab}
          loading={loading}
          onOpenTrackingSeat={onOpenTrackingSeat}
          blacklistDomains={blacklistDomains}
          blockedPrograms={blockedPrograms}
        />
      )}
    </div>
  );
}

function Summary({ icon: Icon, label, value, tone }) {
  return (
    <Card className="p-4 md:p-5">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${tone}`}><Icon size={17} /></div>
      <div className="text-xl font-bold text-ink">{value}</div>
      <div className="text-[11px] text-muted mt-1">{label}</div>
    </Card>
  );
}

function kindLabel(kind) {
  if (kind === "website") return "เว็บไซต์";
  if (kind === "program") return "โปรแกรม";
  return "กิจกรรม";
}

function ReviewTable({ rows, loading, busyId, onOpenTrackingSeat, onMarkGood, onMarkBad }) {
  const rowBusy = Boolean(busyId);
  return (
    <Card className="p-5 md:p-6 overflow-hidden">
      {!loading && (
        <div className="flex items-center gap-2 mb-4 text-amber-700 text-xs bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          <AlertTriangle size={14} />
          {rows.length > 0
            ? `รอตรวจสอบ ${rows.length} รายการ — กด บล็อก เพื่อขึ้นรายการบล็อกและหักคะแนนผู้ใช้`
            : "ยังไม่มีรายการต้องสงสัยที่รอตรวจสอบ"}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-xs text-left">
          <thead>
            <tr className="text-slate-500 border-b border-slate-200">
              <th className="pb-3 font-semibold">ล่าสุด</th>
              <th className="pb-3 font-semibold">ผู้ใช้</th>
              <th className="pb-3 font-semibold">ห้อง / เครื่อง</th>
              <th className="pb-3 font-semibold">ชนิด</th>
              <th className="pb-3 font-semibold">กิจกรรม</th>
              <th className="pb-3 font-semibold">ครั้ง</th>
              <th className="pb-3 font-semibold text-right">ตรวจสอบ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/70">
                <td className="py-3.5 text-slate-600">{formatDateTime(row.lastSeenAt)}</td>
                <td className="py-3.5 font-medium text-ink">{row.user?.displayName || "-"}</td>
                <td className="py-3.5 text-slate-600">
                  {row.roomName || "-"}
                  <br />
                  <span className="text-slate-400">{row.seatLabel || ""}</span>
                </td>
                <td className="py-3.5">
                  <Pill tone="amber">{kindLabel(row.kind)}</Pill>
                  <div className="text-slate-500 mt-1 max-w-[140px] truncate">{row.target}</div>
                </td>
                <td className="py-3.5 text-slate-700 max-w-xs">{row.activity}</td>
                <td className="py-3.5 text-slate-600">{row.occurrenceCount}</td>
                <td className="py-3.5">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      icon={Check}
                      iconPosition="left"
                      disabled={rowBusy}
                      onClick={() => onMarkGood(row)}
                    >
                      ผ่าน
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      icon={Ban}
                      iconPosition="left"
                      disabled={rowBusy}
                      onClick={() => onMarkBad(row)}
                    >
                      บล็อก
                    </Button>
                    {row.seatId && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => onOpenTrackingSeat?.({ roomId: row.roomId, seatId: row.seatId })}
                      >
                        ไปที่เครื่อง
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-muted">
                  {loading ? "กำลังโหลดข้อมูล..." : "ไม่พบรายการต้องสงสัยที่รอตรวจสอบ"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ActivityTable({
  rows,
  tab,
  loading,
  onOpenTrackingSeat,
  blacklistDomains,
  blockedPrograms,
}) {
  return (
    <Card className="p-5 md:p-6 overflow-hidden">
      {tab === "flagged" && !loading && (
        <div className="flex items-center gap-2 mb-4 text-amber-700 text-xs bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
          <AlertTriangle size={14} /> พบกิจกรรมน่าสงสัย {rows.length} รายการตามตัวกรอง
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-xs text-left">
          <thead>
            <tr className="text-slate-500 border-b border-slate-200">
              <th className="pb-3 font-semibold">เวลา</th>
              <th className="pb-3 font-semibold">ผู้ใช้</th>
              <th className="pb-3 font-semibold">ห้อง / เครื่อง</th>
              <th className="pb-3 font-semibold">กิจกรรม</th>
              <th className="pb-3 font-semibold">สถานะ</th>
              <th className="pb-3 font-semibold text-right">การดำเนินการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => {
              const websiteBlocked = isWebsiteBlocked(row.website, blacklistDomains);
              const programBlocked = isProgramBlocked(row.program, blockedPrograms);
              const blocked = websiteBlocked || programBlocked;
              const status = blocked
                ? { tone: "red", label: "บล็อกแล้ว" }
                : row.suspicious
                  ? { tone: "amber", label: "น่าสงสัย" }
                  : { tone: "green", label: "ปกติ" };
              return (
              <tr key={row.id} className="hover:bg-slate-50/70">
                <td className="py-3.5 text-slate-600">{formatDateTime(row.at)}</td>
                <td className="py-3.5 font-medium text-ink">{row.user?.displayName || "-"}</td>
                <td className="py-3.5 text-slate-600">{row.roomName}<br /><span className="text-slate-400">{row.seatLabel}</span></td>
                <td className="py-3.5 text-slate-700 max-w-xs">{row.activity}</td>
                <td className="py-3.5"><Pill tone={status.tone}>{status.label}</Pill></td>
                <td className="py-3.5">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenTrackingSeat?.({ roomId: row.roomId, seatId: row.seatId })}
                    >
                      ไปที่เครื่อง
                    </Button>
                  </div>
                </td>
              </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="py-12 text-center text-muted">
                  {loading ? "กำลังโหลดข้อมูล..." : "ไม่พบข้อมูลตามตัวกรอง"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const RULE_CATEGORIES = [ ["games", "เกม"], ["social", "โซเชียล"], ["streaming", "วิดีโอ/สตรีม"], ["adult", "เนื้อหาผู้ใหญ่"], ["gambling", "การพนัน"], ["education", "การศึกษา"], ["development", "เขียนโปรแกรม"], ["office", "งานเอกสาร"], ["other", "อื่น ๆ"] ];

function CategorySelect({ value, onChange }) {
  return <select aria-label="หมวดหมู่กฎ" value={value} onChange={event => onChange(event.target.value)} className="text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white">{RULE_CATEGORIES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>;
}

function CategoryTag({ category }) {
  return <span className="inline-block ml-2 rounded-full bg-white/80 border px-2 py-0.5 text-xs">{RULE_CATEGORIES.find(([id]) => id === category)?.[1] ?? category}</span>;
}

function Blacklist({
  title,
  description,
  emptyText,
  placeholder,
  nameKey,
  entries,
  draft,
  setDraft,
  onAdd,
  onRemove,
  busy,
}) {
  const [category, setCategory] = useState("other");
  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <Ban size={17} className="text-rose-600" />
        <h2 className="text-sm font-bold text-ink">{title}</h2>
      </div>
      <p className="text-xs text-muted mb-4">{description}</p>
      <div className="sticky top-0 z-10 bg-white pb-4 mb-4 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={placeholder}
            className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2.5"
          />
          <Button
            variant="danger"
            icon={Ban}
            disabled={busy}
            onClick={async () => {
              await onAdd(draft, category);
              setDraft("");
            }}
          >
            เพิ่มในรายการบล็อก
          </Button>
          <CategorySelect value={category} onChange={setCategory} />
        </div>
      </div>
      <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 border border-rose-100 bg-rose-50 rounded-xl px-3.5 py-3 text-xs">
            <div>
              <span className="font-medium text-rose-700">{entry[nameKey]}</span>
              {entry.category && <CategoryTag category={entry.category} />}
            </div>
            <button
              onClick={() => onRemove(entry)}
              disabled={busy}
              className="text-rose-600 flex items-center gap-1 hover:text-rose-800 disabled:opacity-50"
            >
              <X size={13} /> นำออก
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="py-8 text-center text-xs text-muted">{emptyText}</div>
        )}
      </div>
    </Card>
  );
}

function Ut1Import({ catalog, selected, setSelected, onImport, onRemove, busyId }) {
  const items = catalog?.items ?? [];
  const selectedItem = items.find((item) => item.id === selected) ?? items[0];
  const importing = busyId === "ut1-import";
  return (
    <Card className="p-5 md:p-6 mb-5">
      <div className="flex items-center gap-2 mb-1">
        <Download size={17} className="text-navy-700" />
        <h2 className="text-sm font-bold text-ink">นำเข้าหมวดจาก UT1</h2>
      </div>
      <p className="text-xs text-muted mb-4">
        เลือกหมวดแล้วระบบดึงโดเมนจาก Blacklists UT1 มาใส่รายการบล็อกเว็บ — จำกัดไม่เกิน {catalog?.maxLimit || 400} โดเมนต่อหมวด เพื่อให้ไฟล์ hosts ของ Agent รับไหว ไม่ทำ allowlist ทั้งอินเทอร์เน็ต
      </p>
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <select
          value={selectedItem?.id || selected}
          onChange={(event) => setSelected(event.target.value)}
          className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2.5 bg-white"
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} ({item.id}){item.importedCount ? ` · นำเข้าแล้ว ${item.importedCount}` : ""}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          icon={Download}
          iconPosition="left"
          className="shrink-0"
          disabled={importing || !selectedItem}
          onClick={() => onImport(selectedItem?.id)}
        >
          {importing ? "กำลังนำเข้า..." : "นำเข้าหมวดนี้"}
        </Button>
      </div>
      {selectedItem && (
        <div className="text-xs text-slate-500 mb-4 space-y-1">
          <p>{selectedItem.description}</p>
          {selectedItem.sampleDomains?.length > 0 && (
            <p>
              โดเมนตัวอย่างสำหรับเทส:{" "}
              <span className="font-medium text-ink">{selectedItem.sampleDomains.join(", ")}</span>
            </p>
          )}
        </div>
      )}
      <div className="space-y-2">
        {items.filter((item) => item.importedCount > 0).map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 border border-slate-200 bg-slate-50 rounded-xl px-3.5 py-3 text-xs">
            <div>
              <span className="font-medium text-ink">{item.label}</span>
              <span className="text-slate-400 ml-2">{item.id}</span>
              <div className="text-slate-500 mt-0.5">{item.importedCount} โดเมนใน hosts</div>
            </div>
            <button
              onClick={() => onRemove(item.id)}
              disabled={Boolean(busyId)}
              className="text-rose-600 flex items-center gap-1 hover:text-rose-800 disabled:opacity-50"
            >
              <X size={13} /> นำหมวดออก
            </button>
          </div>
        ))}
        {items.every((item) => !item.importedCount) && (
          <div className="py-3 text-center text-xs text-muted">ยังไม่ได้นำเข้าหมวด UT1</div>
        )}
      </div>
    </Card>
  );
}

function Allowlist({ entries, draft, setDraft, onAdd, onRemove, busy }) {
  const [category, setCategory] = useState("other");
  return (
    <Card className="p-5 md:p-6">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={17} className="text-emerald-600" />
        <h2 className="text-sm font-bold text-ink">โปรแกรมที่อนุญาตในแล็บ</h2>
      </div>
      <p className="text-xs text-muted mb-4">
        ซอฟต์แวร์ที่ห้องแล็บมีให้ใช้ เช่น เบราว์เซอร์, VS Code, Office — โปรแกรมนอกนี้ถ้าไม่ใช่ระบบ Windows และไม่ได้อยู่ในรายการห้าม จะไปแท็บไม่รู้จักเป็นสรุป ไม่ขึ้นคิวทีละคลิก
      </p>
      <div className="sticky top-0 z-10 bg-white pb-4 mb-4 border-b border-slate-100">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="เช่น chrome.exe"
            className="flex-1 text-xs border border-slate-200 rounded-xl px-3 py-2.5"
          />
          <Button
            variant="success"
            icon={ShieldCheck}
            disabled={busy}
            onClick={async () => {
              await onAdd(draft, category);
              setDraft("");
            }}
          >
            เพิ่มในรายการอนุญาต
          </Button>
          <CategorySelect value={category} onChange={setCategory} />
        </div>
      </div>
      <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
        {entries.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-3 border border-emerald-100 bg-emerald-50 rounded-xl px-3.5 py-3 text-xs">
            <div>
              <span className="font-medium text-emerald-800">{entry.displayName || entry.processName}</span>
              <span className="text-emerald-500 ml-2">{entry.processName}</span>
              {entry.category && <CategoryTag category={entry.category} />}
            </div>
            <button
              onClick={() => onRemove(entry)}
              disabled={busy}
              className="text-emerald-700 flex items-center gap-1 hover:text-emerald-900 disabled:opacity-50"
            >
              <X size={13} /> นำออก
            </button>
          </div>
        ))}
        {entries.length === 0 && (
          <div className="py-8 text-center text-xs text-muted">ยังไม่มีโปรแกรมในรายการอนุญาต</div>
        )}
      </div>
    </Card>
  );
}

function UnknownTable({ rows, loading, busyId, onAllow, onBlock }) {
  return (
    <Card className="p-5 md:p-6 overflow-hidden">
      {!loading && (
        <div className="flex items-center gap-2 mb-4 text-slate-600 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
          <AlertTriangle size={14} />
          {rows.length > 0
            ? `${rows.length} โปรแกรมที่ไม่ใช่ระบบ Windows ไม่ใช่รายการอนุญาต และไม่ใช่รายการห้าม — รวมจำนวนครั้ง/จำนวนเครื่อง ไม่หักคะแนน`
            : "ยังไม่พบโปรแกรมที่ไม่รู้จักตามตัวกรอง"}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-xs text-left">
          <thead>
            <tr className="text-slate-500 border-b border-slate-200">
              <th className="pb-3 font-semibold">โปรแกรม</th>
              <th className="pb-3 font-semibold">ครั้ง</th>
              <th className="pb-3 font-semibold">เครื่อง</th>
              <th className="pb-3 font-semibold">เห็นล่าสุด</th>
              <th className="pb-3 font-semibold text-right">จัดเข้าบัญชี</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.processName} className="hover:bg-slate-50/70">
                <td className="py-3.5 font-medium text-ink">{row.processName}</td>
                <td className="py-3.5 text-slate-600">{row.occurrenceCount}</td>
                <td className="py-3.5 text-slate-600">{row.machineCount}</td>
                <td className="py-3.5 text-slate-600">{formatDateTime(row.lastSeenAt)}</td>
                <td className="py-3.5">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="success"
                      icon={ShieldCheck}
                      iconPosition="left"
                      disabled={Boolean(busyId)}
                      onClick={() => onAllow(row.processName)}
                    >
                      อนุญาต
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      icon={Ban}
                      iconPosition="left"
                      disabled={Boolean(busyId)}
                      onClick={() => onBlock(row.processName)}
                    >
                      ห้ามใช้
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="py-12 text-center text-muted">
                  {loading ? "กำลังโหลดข้อมูล..." : "ไม่พบโปรแกรมที่ไม่รู้จักตามตัวกรอง"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
