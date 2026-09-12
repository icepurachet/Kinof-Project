import { API_URL, apiFetch, readStoredAuth } from "./auth";

export function problemImageUrl(url) {
  return url.startsWith("http") ? url : `${API_URL}${url}`;
}

export async function loadProblemImage(url) {
  const auth = readStoredAuth();
  const response = await fetch(problemImageUrl(url), {
    headers: auth?.accessToken ? { Authorization: `Bearer ${auth.accessToken}` } : {},
  });
  if (!response.ok) throw new Error("ไม่สามารถโหลดรูปภาพแนบได้");
  return URL.createObjectURL(await response.blob());
}

export function getMyProblemReports() {
  return apiFetch("/issues").then((rows) => rows.map(mapUserIssue));
}

export function getProblemReports() {
  return apiFetch("/admin/issues").then((rows) => rows.map(mapAdminIssue));
}

export function getProblemReport(id) {
  return apiFetch(`/issues/${id}`).then(mapUserIssue);
}

export function createProblemReport({ category, description, files }) {
  const form = new FormData();
  form.append("category", category);
  form.append("title", category);
  form.append("description", description);
  files.forEach((file) => form.append("files", file));
  return apiFetch("/issues", { method: "POST", body: form }).then(mapUserIssue);
}

export async function updateProblemReportStatus(id, status) {
  await apiFetch(`/admin/issues/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: toApiStatus(status) }),
  });
  const rows = await getProblemReports();
  return rows.find((row) => row.id === id);
}

const STATUS_LABELS = {
  pending: "รอดำเนินการ",
  in_progress: "กำลังดำเนินการ",
  completed: "เสร็จสิ้น",
};

function toApiStatus(status) {
  return Object.entries(STATUS_LABELS).find(([, label]) => label === status)?.[0] ?? status;
}

function parseImageUrls(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function mapImages(value, issueId) {
  return parseImageUrls(value).map((url, index) => ({
    id: `${issueId}-${index}`,
    url,
    originalFileName: `รูปแนบ ${index + 1}`,
  }));
}

function mapUserIssue(issue) {
  return {
    ...issue,
    id: issue.issue_id,
    status: STATUS_LABELS[issue.status] ?? issue.status,
    createdAt: issue.created_at,
    images: mapImages(issue.image_urls, issue.issue_id),
  };
}

function mapAdminIssue(issue) {
  return {
    ...issue,
    id: issue.id,
    status: STATUS_LABELS[issue.status] ?? issue.status,
    createdAt: issue.created_at,
    images: mapImages(issue.image_urls, issue.id),
    user: {
      id: issue.user_id,
      username: issue.username,
      email: issue.email,
      name: issue.username,
    },
  };
}
