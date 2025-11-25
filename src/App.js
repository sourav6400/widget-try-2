import './App.css';
import React, { useCallback, useEffect, useReducer, useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Col, Row, Button, Form, Container, Alert, Table, Card, ListGroup, Spinner, Badge } from 'react-bootstrap';
import axios from 'axios';
import { initialstate } from './Reducer/reducer';
import reducer from './Reducer/reducer';
export const ZOHO = window.ZOHO;

const getFirstNonEmptyString = (value) => {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed !== "" ? trimmed : "";
    }
    if (typeof value === "number") {
        return value.toString();
    }
    return "";
};

const resolveEntityIdFromPageData = (pageData) => {
    if (!pageData || typeof pageData !== "object") {
        return "";
    }
    // Check if EntityId is an array (ListView mode)
    if (Array.isArray(pageData.EntityId) && pageData.EntityId.length > 0) {
        return pageData.EntityId;
    }
    const directMatches = [
        pageData.EntityId,
        pageData.RecordId,
        pageData.recordId,
        pageData.entityId
    ];
    for (const candidate of directMatches) {
        if (Array.isArray(candidate) && candidate.length > 0) {
            return candidate;
        }
        const normalized = getFirstNonEmptyString(candidate);
        if (normalized) {
            return normalized;
        }
    }
    const arrayCandidates = [
        pageData.EntityIdList,
        pageData.EntityIds,
        pageData.entityIdList,
        pageData.entityIds,
        pageData.SelectedIds,
        pageData.selectedIds,
        pageData.RecordIds,
        pageData.recordIds
    ];
    for (const list of arrayCandidates) {
        if (!Array.isArray(list)) {
            continue;
        }
        if (list.length > 0) {
            return list;
        }
        const directValue = list
            .map((item) => getFirstNonEmptyString(item))
            .find((value) => value);
        if (directValue) {
            return directValue;
        }
        const objectValue = list.find((item) => item && typeof item === "object");
        const nestedMatches = objectValue
            ? [
                objectValue.EntityId,
                objectValue.entityId,
                objectValue.RecordId,
                objectValue.recordId,
                objectValue.id,
                objectValue.Id,
                objectValue.ID
            ]
            : [];
        for (const nested of nestedMatches) {
            const normalized = getFirstNonEmptyString(nested);
            if (normalized) {
                return normalized;
            }
        }
    }
    return "";
};

function App() {
    const [isOnline, setIsOnline] = useState();
    const [state, dispatch] = useReducer(reducer, initialstate);
    const [Entity, setEntity] = useState();
    const [entityIds, setEntityIds] = useState([]);
    const [attachments, setAttachments] = useState([]);
    const [attachmentsLoading, setAttachmentsLoading] = useState(false);
    const [attachmentsError, setAttachmentsError] = useState("");
    const [downloadError, setDownloadError] = useState("");
    const [selectedAttachmentIds, setSelectedAttachmentIds] = useState(new Set());
    const [isDeleting, setIsDeleting] = useState(false);
    const [downloadingIds, setDownloadingIds] = useState(new Set());

    useEffect(() => {
        ZOHO.embeddedApp.on("PageLoad", function (data) {
            console.log(data);
            setEntity(data.Entity);
            setIsOnline(navigator.onLine);
            ZOHO.CRM.UI.Resize({ height: "650", width: "600" }).then(function (sizeResponse) {
                return sizeResponse;
            });
            dispatch({ type: "SETPAGE", payload: data.ButtonPosition });
            const resolvedEntityId = resolveEntityIdFromPageData(data);
            const entityIdArray = Array.isArray(resolvedEntityId) 
                ? resolvedEntityId.filter(id => id && getFirstNonEmptyString(id))
                : resolvedEntityId ? [resolvedEntityId] : [];
            setEntityIds(entityIdArray);
            dispatch({ type: "SETENTITYID", payload: Array.isArray(resolvedEntityId) ? resolvedEntityId[0] : resolvedEntityId });
            dispatch({ type: "SETENTITYNAME", payload: data.Entity });
        });
        ZOHO.embeddedApp.init();
    }, [])

    const persistSelection = useCallback((items) => {
        setSelectedAttachmentIds((prev) => {
            const next = new Set();
            items.forEach((item) => {
                if (item?.id && prev.has(item.id)) {
                    next.add(item.id);
                }
            });
            return next;
        });
    }, []);

    const normalizeAttachmentRecord = useCallback((raw) => {
        if (!raw || typeof raw !== "object") {
            return null;
        }
        const id = raw.id ?? raw.ID ?? raw.Attachment_Id ?? raw.attachment_id ?? raw.Attachment_Id__c;
        const name = raw.file_name ?? raw.File_Name ?? raw.Name ?? raw.title ?? "-";
        const type =
            raw.type ??
            raw.Type ??
            raw.file_type ??
            raw.File_Type ??
            raw.Content_Type ??
            raw.mime_type ??
            "-";
        const size =
            raw.size ??
            raw.Size ??
            raw.file_size ??
            raw.File_Size ??
            raw.Attachment_Size ??
            raw.size_in_bytes ??
            null;
        const ownerRecord = raw.owner ?? raw.Owner ?? raw.Created_By ?? raw.Created_By1;
        const ownerName = ownerRecord?.name ?? ownerRecord?.Name ?? ownerRecord?.full_name ?? "-";
        const createdTime =
            raw.created_time ?? raw.Created_Time ?? raw.Created_At ?? raw.Created_On ?? raw.CreatedTime;
        const downloadUrl =
            raw.$download_url ??
            raw.download_url ??
            raw.Download_URL ??
            raw.downloadUrl ??
            raw.DownloadUrl ??
            raw.download_link ??
            raw.Download_Link;
        const linkUrl = raw.link_url ?? raw.Link_URL ?? raw.linkUrl ?? raw.LinkUrl;

        return {
            id,
            name,
            type,
            size,
            ownerName,
            createdTime,
            downloadUrl,
            linkUrl,
            raw
        };
    }, []);

    const fetchAttachments = useCallback(async () => {
        if (!state.entityname || entityIds.length === 0) {
            return;
        }
        setAttachmentsLoading(true);
        setAttachmentsError("");
        setDownloadError("");
        try {
            const allAttachments = [];
            for (const recordId of entityIds) {
                try {
                    const response = await ZOHO.CRM.API.getRelatedRecords({
                        Entity: state.entityname,
                        RecordID: recordId,
                        RelatedList: "Attachments",
                        page: 1,
                        per_page: 200
                    });
                    const list = Array.isArray(response?.data)
                        ? response.data
                        : Array.isArray(response?.data?.data)
                            ? response.data.data
                            : [];
                    console.log(`Attachments API response for record ${recordId}:`, response);
                    const normalized = list
                        .map((record) => normalizeAttachmentRecord(record))
                        .filter((record) => record && record.id);
                    allAttachments.push(...normalized);
                } catch (error) {
                    console.error(`Failed to fetch attachments for record ${recordId}`, error);
                }
            }
            setAttachments(allAttachments);
            persistSelection(allAttachments);
        } catch (error) {
            console.error("Failed to fetch attachments", error);
            setAttachmentsError("Unable to load attachments. Please try again.");
        } finally {
            setAttachmentsLoading(false);
        }
    }, [normalizeAttachmentRecord, persistSelection, entityIds, state.entityname]);

    useEffect(() => {
        fetchAttachments();
    }, [fetchAttachments]);

    const updateDownloadingIds = useCallback((attachmentId, shouldAdd) => {
        if (!attachmentId) {
            return;
        }
        setDownloadingIds((prev) => {
            const next = new Set(prev);
            if (shouldAdd) {
                next.add(attachmentId);
            } else {
                next.delete(attachmentId);
            }
            return next;
        });
    }, []);

    const base64ToBlob = (base64, contentType = "application/octet-stream") => {
        if (!base64) {
            throw new Error("Missing base64 payload");
        }
        const cleaned = base64.includes(";base64,") ? base64.split(";base64,").pop() : base64;
        const byteCharacters = atob(cleaned || "");
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i += 1) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        return new Blob([byteArray], { type: contentType || "application/octet-stream" });
    };

    const pickFirstString = (...values) =>
        values.find((value) => typeof value === "string" && value.trim() !== "");

    const pickFirstObject = (...values) =>
        values.find((value) => value && typeof value === "object" && !Array.isArray(value));

    const normalizeKey = (key) => (key ? key.toString().toLowerCase().replace(/[^a-z0-9]/g, "") : "");

    const deepFindValueByKeys = (node, keySet, visited = new WeakSet()) => {
        if (!node || typeof node !== "object") {
            return undefined;
        }
        if (visited.has(node)) {
            return undefined;
        }
        visited.add(node);

        const iterable = Array.isArray(node) ? node.entries() : Object.entries(node);
        // eslint-disable-next-line no-restricted-syntax
        for (const [rawKey, value] of iterable) {
            const normalizedKey = Array.isArray(node) ? "" : normalizeKey(rawKey);
            if (
                normalizedKey &&
                keySet.has(normalizedKey) &&
                (typeof value === "string" || typeof value === "number")
            ) {
                return value;
            }
            if (value && typeof value === "object") {
                const result = deepFindValueByKeys(value, keySet, visited);
                if (result !== undefined) {
                    return result;
                }
            }
        }
        return undefined;
    };

    const CONTENT_KEYS = new Set(
        [
            "file_content",
            "filecontent",
            "file_data",
            "filedata",
            "content",
            "file",
            "data",
            "body",
            "filebody",
            "attachmentdata",
            "filebytes"
        ].map((key) => normalizeKey(key))
    );
    const NAME_KEYS = new Set(
        ["file_name", "filename", "name", "file", "attachmentname"].map((key) => normalizeKey(key))
    );
    const TYPE_KEYS = new Set(
        ["file_type", "filetype", "type", "content_type", "contenttype", "mimetype"].map((key) => normalizeKey(key))
    );
    const DOWNLOAD_URL_KEYS = new Set(
        [
            "download_url",
            "$download_url",
            "downloadurl",
            "file_url",
            "fileurl",
            "url",
            "href",
            "link",
            "attachmenturl",
            "link_url"
        ].map((key) => normalizeKey(key))
    );

    const extractFieldsFromCandidate = (candidate = {}) => ({
        content:
            pickFirstString(
                candidate.File_Content,
                candidate.file_content,
                candidate.FileContent,
                candidate.fileContent,
                candidate.file,
                candidate.body,
                candidate.fileData,
                candidate.data,
                candidate.content,
                deepFindValueByKeys(candidate, CONTENT_KEYS)
            ) || "",
        name:
            pickFirstString(
                candidate.File_Name,
                candidate.file_name,
                candidate.FileName,
                candidate.Name,
                candidate.name,
                deepFindValueByKeys(candidate, NAME_KEYS)
            ) || "",
        type:
            pickFirstString(
                candidate.File_Type,
                candidate.file_type,
                candidate.Content_Type,
                candidate.ContentType,
                candidate.mime_type,
                candidate.type,
                deepFindValueByKeys(candidate, TYPE_KEYS)
            ) || "",
        downloadUrl:
            pickFirstString(
                candidate.$download_url,
                candidate.download_url,
                candidate.Download_URL,
                candidate.downloadUrl,
                candidate.DownloadUrl,
                candidate.file_url,
                candidate.fileUrl,
                candidate.File_URL,
                candidate.href,
                candidate.url,
                candidate.link,
                deepFindValueByKeys(candidate, DOWNLOAD_URL_KEYS)
            ) || ""
    });

    const extractFilePayload = (response) => {
        if (!response) {
            return {};
        }

        // Check for binary data first (Blob or ArrayBuffer)
        const binaryBody = response.body || response.response || response.data || response.file || response.content;
        if (binaryBody instanceof Blob) {
            return {
                blob: binaryBody,
                type: response.type || "application/octet-stream",
                name: response.name
            };
        }
        if (binaryBody instanceof ArrayBuffer) {
            return {
                blob: new Blob([binaryBody], { type: response.type || "application/octet-stream" }),
                type: response.type || "application/octet-stream",
                name: response.name
            };
        }

        const directDownloadUrl = pickFirstString(
            response.$download_url,
            response.download_url,
            response.downloadUrl,
            response.file_url,
            response.fileUrl,
            response.url,
            response.href
        );

        const directContent = pickFirstString(
            response.data,
            response.file,
            response.body,
            response.File_Content,
            response.fileContent,
            response.file_content,
            response.content
        );
        if (directContent || directDownloadUrl) {
            return { content: directContent, downloadUrl: directDownloadUrl };
        }

        const candidates = [];
        if (Array.isArray(response.data)) {
            candidates.push(...response.data);
        }
        if (Array.isArray(response?.data?.data)) {
            candidates.push(...response.data.data);
        }
        if (Array.isArray(response.file)) {
            candidates.push(...response.file);
        }
        if (Array.isArray(response.details)) {
            candidates.push(...response.details);
        }
        const singleCandidate = pickFirstObject(response.data, response.details, response.result, response.response);
        if (singleCandidate) {
            candidates.push(singleCandidate);
        }

        if (candidates.length > 0) {
            const fields = extractFieldsFromCandidate(candidates.find((candidate) => candidate));
            if (fields.content || fields.downloadUrl) {
                return fields;
            }
        }

        return {};
    };

    const triggerFileDownload = (blob, fileName) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const triggerUrlDownload = async (url, fileName) => {
        if (!url) {
            return false;
        }
        try {
            // Extract attachment ID from URL if it's a Zoho attachment URL
            const attachmentIdMatch = url.match(/Attachments\/([^/?]+)/);
            const attachmentId = attachmentIdMatch ? attachmentIdMatch[1] : null;
            
            // If we have an attachment ID, try using getFile API first (most reliable)
            if (attachmentId) {
                try {
                    const fileResponse = await ZOHO.CRM.API.getFile({ id: attachmentId });
                    console.log("getFile response:", fileResponse);
                    
                    let blob;
                    // Check if response is already a Blob
                    if (fileResponse instanceof Blob) {
                        blob = fileResponse;
                    } else {
                        // Check various response properties for binary data
                        const binaryData = fileResponse?.body || fileResponse?.data || fileResponse?.file || fileResponse?.content || fileResponse?.response;
                        
                        if (binaryData instanceof Blob) {
                            blob = binaryData;
                        } else if (binaryData instanceof ArrayBuffer) {
                            blob = new Blob([binaryData]);
                        } else if (typeof binaryData === "string" && binaryData.length > 0) {
                            // Try base64 decode
                            try {
                                const cleaned = binaryData.includes(";base64,") 
                                    ? binaryData.split(";base64,").pop() 
                                    : binaryData;
                                const byteCharacters = atob(cleaned);
                                const byteNumbers = new Array(byteCharacters.length);
                                for (let i = 0; i < byteCharacters.length; i += 1) {
                                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                                }
                                const byteArray = new Uint8Array(byteNumbers);
                                blob = new Blob([byteArray]);
                            } catch (e) {
                                console.warn("Base64 decode failed, treating as plain text", e);
                                blob = new Blob([binaryData]);
                            }
                        } else {
                            console.warn("No valid binary data found in getFile response");
                            // Fall through to HTTP.get method
                        }
                        
                        if (blob && blob.size > 0) {
                            const finalFileName = fileName || fileResponse?.name || "download";
                            triggerFileDownload(blob, finalFileName);
                            return true;
                        }
                    }
                } catch (getFileError) {
                    console.warn("getFile API failed, trying HTTP.get", getFileError);
                }
            }
            
            // Fallback: For relative URLs starting with /crm/, fetch as blob using HTTP.get
            if (url.startsWith("/crm/")) {
                try {
                    const response = await ZOHO.CRM.HTTP.get({
                        url: url,
                        params: { download: true }
                    });
                    console.log("HTTP.get response:", response);
                    
                    if (response) {
                        const body = response.body || response.response || response.data;
                        let blob;
                        if (body instanceof Blob) {
                            blob = body;
                        } else if (body instanceof ArrayBuffer) {
                            blob = new Blob([body]);
                        } else if (typeof body === "string" && body.length > 0) {
                            // Try base64 decode
                            try {
                                const cleaned = body.includes(";base64,") 
                                    ? body.split(";base64,").pop() 
                                    : body;
                                const byteCharacters = atob(cleaned);
                                const byteNumbers = new Array(byteCharacters.length);
                                for (let i = 0; i < byteCharacters.length; i += 1) {
                                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                                }
                                const byteArray = new Uint8Array(byteNumbers);
                                blob = new Blob([byteArray]);
                            } catch (e) {
                                console.warn("Base64 decode failed", e);
                                blob = new Blob([body]);
                            }
                        } else {
                            console.warn("Empty or invalid response body");
                            throw new Error("Empty response body");
                        }
                        
                        if (blob && blob.size > 0) {
                            const headers = response.headers || response.header || {};
                            const contentType = headers["Content-Type"] || headers["content-type"] || "application/octet-stream";
                            const nameFromHeader =
                                parseFileNameFromDisposition(headers["Content-Disposition"]) ||
                                parseFileNameFromDisposition(headers["content-disposition"]);
                            const finalFileName = nameFromHeader || fileName || "download";
                            triggerFileDownload(blob, finalFileName);
                            return true;
                        } else {
                            throw new Error("Empty blob created");
                        }
                    }
                } catch (httpError) {
                    console.warn("HTTP.get failed, trying direct link", httpError);
                }
            }
            
            // Final fallback: try direct download link (for absolute URLs)
            const link = document.createElement("a");
            link.href = url;
            if (fileName) {
                link.download = fileName;
            }
            link.style.display = "none";
            document.body.appendChild(link);
            link.click();
            setTimeout(() => {
                document.body.removeChild(link);
            }, 100);
            return true;
        } catch (error) {
            console.error("Failed to trigger download", error);
            return false;
        }
    };

    const parseFileNameFromDisposition = (headerValue) => {
        if (!headerValue || typeof headerValue !== "string") {
            return null;
        }
        const match = headerValue.match(/filename\s*=\s*("?)([^";]+)\1/);
        return match ? match[2] : null;
    };

    const fetchAttachmentViaHttp = useCallback(
        async (attachmentId) => {
            if (!state.entityname || entityIds.length === 0 || !attachmentId) {
                return {};
            }
            for (const recordId of entityIds) {
                try {
                    // Try using getFile API first as it handles binary better
                    try {
                        const fileResponse = await ZOHO.CRM.API.getFile({ id: attachmentId });
                        if (fileResponse instanceof Blob) {
                            return {
                                blob: fileResponse,
                                type: "application/octet-stream",
                                name: null
                            };
                        }
                        const fileBinary = fileResponse?.body || fileResponse?.data || fileResponse?.file || fileResponse?.content;
                        if (fileBinary instanceof Blob) {
                            return {
                                blob: fileBinary,
                                type: fileResponse?.type || "application/octet-stream",
                                name: fileResponse?.name || null
                            };
                        }
                        if (fileBinary instanceof ArrayBuffer) {
                            return {
                                blob: new Blob([fileBinary], { type: fileResponse?.type || "application/octet-stream" }),
                                type: fileResponse?.type || "application/octet-stream",
                                name: fileResponse?.name || null
                            };
                        }
                    } catch (fileError) {
                        console.warn("getFile API failed, trying HTTP.get", fileError);
                    }

                    // Fallback to HTTP.get
                    const response = await ZOHO.CRM.HTTP.get({
                        url: `/crm/v5/${state.entityname}/${recordId}/Attachments/${attachmentId}`,
                        params: { download: true }
                    });
                    if (!response) {
                        continue;
                    }
                    const headers = response.headers || response.header || {};
                    const nameFromHeader =
                        parseFileNameFromDisposition(headers["Content-Disposition"]) ||
                        parseFileNameFromDisposition(headers["content-disposition"]);
                    const contentType = headers["Content-Type"] || headers["content-type"] || "application/octet-stream";
                    
                    // Check if response is already a Blob or ArrayBuffer (binary data)
                    const body = response.body || response.response || response.data;
                    if (body instanceof Blob) {
                        return {
                            blob: body,
                            type: contentType,
                            name: nameFromHeader
                        };
                    }
                    if (body instanceof ArrayBuffer) {
                        return {
                            blob: new Blob([body], { type: contentType }),
                            type: contentType,
                            name: nameFromHeader
                        };
                    }
                    
                    // If it's a string, check if it's base64 or needs to be treated as binary
                    if (typeof body === "string") {
                        // If it looks like base64, decode it
                        if (/^[A-Za-z0-9+/=]+$/.test(body.trim()) && body.length > 100) {
                            return {
                                content: body,
                                type: contentType,
                                name: nameFromHeader
                            };
                        }
                        // Otherwise, it might be corrupted - return empty
                        console.warn("Received string response that doesn't look like base64");
                        return {};
                    }
                    
                    return {};
                } catch (error) {
                    console.warn(`Fallback download failed for record ${recordId}`, error);
                }
            }
            return {};
        },
        [entityIds, state.entityname]
    );

    const fetchAttachmentPayload = useCallback(
        async (attachment) => {
            if (!attachment?.id) {
                return {};
            }

            const fetchers = [
                async () => {
                    try {
                        const response = await ZOHO.CRM.API.getFile({ id: attachment.id });
                        console.log("getFile response structure:", {
                            isBlob: response instanceof Blob,
                            hasBody: !!response.body,
                            hasData: !!response.data,
                            hasFile: !!response.file,
                            hasContent: !!response.content,
                            hasResponse: !!response.response,
                            keys: Object.keys(response || {})
                        });
                        
                        // Check if response is already a Blob
                        if (response instanceof Blob) {
                            if (response.size === 0) {
                                console.warn("getFile returned empty Blob");
                                return {};
                            }
                            return {
                                blob: response,
                                type: attachment.type || "application/octet-stream",
                                name: attachment.name
                            };
                        }
                        
                        // Check if response has binary data in various locations
                        const binaryData = response.body || response.data || response.file || response.content || response.response || response;
                        
                        if (binaryData instanceof Blob) {
                            if (binaryData.size === 0) {
                                console.warn("getFile returned empty Blob in response");
                                return {};
                            }
                            return {
                                blob: binaryData,
                                type: response.type || attachment.type || "application/octet-stream",
                                name: response.name || attachment.name
                            };
                        }
                        if (binaryData instanceof ArrayBuffer) {
                            if (binaryData.byteLength === 0) {
                                console.warn("getFile returned empty ArrayBuffer");
                                return {};
                            }
                            return {
                                blob: new Blob([binaryData], { type: response.type || attachment.type || "application/octet-stream" }),
                                type: response.type || attachment.type || "application/octet-stream",
                                name: response.name || attachment.name
                            };
                        }
                        
                        // Try extractFilePayload which might find base64 content
                        const extracted = extractFilePayload(response);
                        if (extracted.blob && extracted.blob.size > 0) {
                            return extracted;
                        }
                        if (extracted.content) {
                            return extracted;
                        }
                        
                        console.warn("getFile response doesn't contain valid binary data");
                        return {};
                    } catch (error) {
                        console.warn("ZOHO.CRM.API.getFile failed", error);
                        return {};
                    }
                },
                async () => fetchAttachmentViaHttp(attachment.id),
                async () => {
                    if (!attachment.downloadUrl) {
                        return {};
                    }
                    if (attachment.downloadUrl.startsWith("/crm/")) {
                        const response = await ZOHO.CRM.HTTP.get({
                            url: attachment.downloadUrl,
                            params: attachment.downloadUrl.includes("download=") ? {} : { download: true }
                        });
                        if (!response) {
                            return {};
                        }
                        // Check if response is binary (Blob or ArrayBuffer)
                        const body = response.body || response.response || response.data;
                        if (body instanceof Blob) {
                            const headers = response.headers || response.header || {};
                            const contentType = headers["Content-Type"] || headers["content-type"] || "application/octet-stream";
                            const nameFromHeader =
                                parseFileNameFromDisposition(headers["Content-Disposition"]) ||
                                parseFileNameFromDisposition(headers["content-disposition"]);
                            return {
                                blob: body,
                                type: contentType,
                                name: nameFromHeader
                            };
                        }
                        if (body instanceof ArrayBuffer) {
                            const headers = response.headers || response.header || {};
                            const contentType = headers["Content-Type"] || headers["content-type"] || "application/octet-stream";
                            const nameFromHeader =
                                parseFileNameFromDisposition(headers["Content-Disposition"]) ||
                                parseFileNameFromDisposition(headers["content-disposition"]);
                            return {
                                blob: new Blob([body], { type: contentType }),
                                type: contentType,
                                name: nameFromHeader
                            };
                        }
                        return extractFilePayload(response);
                    }
                    for (const recordId of entityIds) {
                        try {
                            const response = await ZOHO.CRM.HTTP.get({
                                url: `/crm/v5/${state.entityname}/${recordId}/Attachments/${attachment.id}`,
                                params: { download: true }
                            });
                            if (!response) {
                                continue;
                            }
                            // Check if response is binary (Blob or ArrayBuffer)
                            const body = response.body || response.response || response.data;
                            if (body instanceof Blob) {
                                const headers = response.headers || response.header || {};
                                const contentType = headers["Content-Type"] || headers["content-type"] || "application/octet-stream";
                                const nameFromHeader =
                                    parseFileNameFromDisposition(headers["Content-Disposition"]) ||
                                    parseFileNameFromDisposition(headers["content-disposition"]);
                                return {
                                    blob: body,
                                    type: contentType,
                                    name: nameFromHeader
                                };
                            }
                            if (body instanceof ArrayBuffer) {
                                const headers = response.headers || response.header || {};
                                const contentType = headers["Content-Type"] || headers["content-type"] || "application/octet-stream";
                                const nameFromHeader =
                                    parseFileNameFromDisposition(headers["Content-Disposition"]) ||
                                    parseFileNameFromDisposition(headers["content-disposition"]);
                                return {
                                    blob: new Blob([body], { type: contentType }),
                                    type: contentType,
                                    name: nameFromHeader
                                };
                            }
                            return extractFilePayload(response);
                        } catch (error) {
                            console.warn(`Download failed for record ${recordId}`, error);
                        }
                    }
                    return {};
                }
            ];

            for (const fetcher of fetchers) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const response = await fetcher();
                    if (response?.content || response?.downloadUrl || response?.blob) {
                        return response;
                    }
                } catch (fetchError) {
                    console.warn("Attachment fetch attempt failed", fetchError);
                }
            }

            return {};
        },
        [fetchAttachmentViaHttp, entityIds, state.entityname]
    );

    const downloadAttachment = useCallback(
        async (attachment) => {
            if (!attachment?.id) {
                return false;
            }
            const fallbackName =
                attachment.name && attachment.name !== "-" ? attachment.name : `Attachment_${attachment.id}`;
            if (attachment.linkUrl) {
                const result = await triggerUrlDownload(
                    attachment.linkUrl,
                    attachment.name && attachment.name !== "-" ? attachment.name : undefined
                );
                return result;
            }
            if (attachment.downloadUrl) {
                const result = await triggerUrlDownload(
                    attachment.downloadUrl,
                    attachment.name && attachment.name !== "-" ? attachment.name : undefined
                );
                return result;
            }
            updateDownloadingIds(attachment.id, true);
            try {
                const payload = await fetchAttachmentPayload(attachment);
                if (payload.downloadUrl) {
                    const result = await triggerUrlDownload(payload.downloadUrl, payload.name || fallbackName);
                    return result;
                }
                // If we have a blob directly, use it
                if (payload.blob instanceof Blob) {
                    if (payload.blob.size === 0) {
                        throw new Error("Downloaded file is empty");
                    }
                    const fileName = payload.name && payload.name !== "-" ? payload.name : fallbackName;
                    triggerFileDownload(payload.blob, fileName);
                    return true;
                }
                // Otherwise, treat as base64 content
                const fileContent = payload.content;
                if (!fileContent) {
                    throw new Error("Empty file content");
                }
                const contentType =
                    payload.type ||
                    (attachment.type && attachment.type !== "-" ? attachment.type : "application/octet-stream");
                const blob = base64ToBlob(fileContent, contentType);
                const fileName = payload.name && payload.name !== "-" ? payload.name : fallbackName;
                triggerFileDownload(blob, fileName);
                return true;
            } catch (error) {
                console.error("Failed to download attachment", error);
                setDownloadError("Unable to download one or more attachments. Please try again.");
                return false;
            } finally {
                updateDownloadingIds(attachment.id, false);
            }
        },
        [fetchAttachmentPayload, updateDownloadingIds]
    );

    const toggleAttachmentSelection = (attachmentId) => {
        setSelectedAttachmentIds((prev) => {
            const next = new Set(prev);
            if (next.has(attachmentId)) {
                next.delete(attachmentId);
            } else {
                next.add(attachmentId);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (attachments.length === 0) {
            return;
        }
        setSelectedAttachmentIds((prev) => {
            if (prev.size === attachments.length) {
                return new Set();
            }
            return new Set(
                attachments
                    .map((attachment) => attachment.id)
                    .filter((attachmentId) => Boolean(attachmentId))
            );
        });
    };

    const deleteAttachments = async (ids) => {
        if (!ids.length || !state.entityname || entityIds.length === 0) {
            return;
        }
        setIsDeleting(true);
        setAttachmentsError("");
        setDownloadError("");
        try {
            await Promise.all(
                ids.map((id) =>
                    ZOHO.CRM.API.deleteRecord({
                        Entity: "Attachments",
                        RecordID: id
                    })
                )
            );
            setAttachments((prev) => prev.filter((attachment) => !ids.includes(attachment.id)));
            setSelectedAttachmentIds((prev) => {
                const next = new Set(prev);
                ids.forEach((id) => next.delete(id));
                return next;
            });
        } catch (error) {
            console.error("Failed to delete attachments", error);
            setAttachmentsError("Unable to delete attachments. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDeleteSelected = () => {
        if (selectedAttachmentIds.size === 0) {
            return;
        }
        if (!window.confirm(`Delete ${selectedAttachmentIds.size} attachment(s)?`)) {
            return;
        }
        deleteAttachments(Array.from(selectedAttachmentIds));
    };

    const handleDeleteSingle = (attachmentId) => {
        if (!window.confirm("Delete this attachment?")) {
            return;
        }
        deleteAttachments([attachmentId]);
    };

    const handleDownloadSingle = async (attachment) => {
        setDownloadError("");
        await downloadAttachment(attachment);
    };

    const handleDownloadSelected = async () => {
        if (selectedAttachmentIds.size === 0) {
            return;
        }
        setDownloadError("");
        const selected = attachments.filter((attachment) => selectedAttachmentIds.has(attachment.id));
        for (const attachment of selected) {
            // eslint-disable-next-line no-await-in-loop
            await downloadAttachment(attachment);
        }
    };

    const formatFileSize = (size) => {
        const numericSize = Number(size);
        if (!numericSize || Number.isNaN(numericSize)) {
            return "-";
        }
        if (numericSize < 1024) {
            return `${numericSize} B`;
        }
        const kb = numericSize / 1024;
        if (kb < 1024) {
            return `${kb.toFixed(1)} KB`;
        }
        const mb = kb / 1024;
        return `${mb.toFixed(1)} MB`;
    };

    return (
        <>
            {(state.page === "DetailView" || state.page === "ListView") &&
                <Container fluid>
                    {isOnline === false &&
                        <Alert variant="danger">
                            You're Offline Check Your Connection.
                        </Alert>
                    }

                    <Card className="mb-3">
                        <Card.Header>
                            <Row className="align-items-center">
                                <Col>
                                    <h5 className="mb-0">
                                        Attachments{" "}
                                        <Badge bg="secondary">{attachments.length}</Badge>
                                    </h5>
                                </Col>
                                <Col className="text-end">
                                    <Button
                                        variant="outline-primary"
                                        size="sm"
                                        onClick={fetchAttachments}
                                        disabled={attachmentsLoading}
                                    >
                                        {attachmentsLoading ? "Refreshing..." : "Refresh"}
                                    </Button>
                                </Col>
                            </Row>
                        </Card.Header>
                        <Card.Body>
                            {(attachmentsError || downloadError) && (
                                <Alert variant="danger" className="mb-3">
                                    {attachmentsError || downloadError}
                                </Alert>
                            )}

                            <Row className="mb-3">
                                <Col>
                                    <Button
                                        variant="danger"
                                        disabled={selectedAttachmentIds.size === 0 || isDeleting}
                                        onClick={handleDeleteSelected}
                                    >
                                        {isDeleting ? (
                                            <>
                                                <Spinner
                                                    as="span"
                                                    animation="border"
                                                    size="sm"
                                                    className="me-2"
                                                />
                                                Deleting...
                                            </>
                                        ) : (
                                            `Delete Selected (${selectedAttachmentIds.size})`
                                        )}
                                    </Button>
                                </Col>
                                <Col className="text-end">
                                    <Button
                                        variant="success"
                                        disabled={selectedAttachmentIds.size === 0 || downloadingIds.size > 0}
                                        onClick={handleDownloadSelected}
                                    >
                                        {downloadingIds.size > 0 ? (
                                            <>
                                                <Spinner
                                                    as="span"
                                                    animation="border"
                                                    size="sm"
                                                    className="me-2"
                                                />
                                                Downloading...
                                            </>
                                        ) : (
                                            `Download Selected (${selectedAttachmentIds.size})`
                                        )}
                                    </Button>
                                </Col>
                            </Row>

                            {attachmentsLoading && (
                                <div className="text-center py-4">
                                    <Spinner animation="border" role="status" />
                                </div>
                            )}

                            {!attachmentsLoading && attachments.length === 0 && (
                                <Alert variant="info" className="mb-0">
                                    No attachments found for this record.
                                </Alert>
                            )}

                            {!attachmentsLoading && attachments.length > 0 && (
                                <Table hover responsive>
                                    <thead>
                                        <tr>
                                            <th>
                                                <Form.Check
                                                    type="checkbox"
                                                    onChange={toggleSelectAll}
                                                    checked={
                                                        attachments.length > 0 &&
                                                        selectedAttachmentIds.size === attachments.length
                                                    }
                                                    aria-label="Select all attachments"
                                                />
                                            </th>
                                            <th>Name</th>
                                            {/* <th>Type</th> */}
                                            <th>Size</th>
                                            {/* <th>Owner</th> */}
                                            <th>Created</th>
                                            <th></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {attachments.map((attachment) => (
                                            <tr key={attachment.id}>
                                                <td>
                                                    <Form.Check
                                                        type="checkbox"
                                                        checked={selectedAttachmentIds.has(attachment.id)}
                                                        onChange={() => toggleAttachmentSelection(attachment.id)}
                                                        aria-label="Select attachment"
                                                    />
                                                </td>
                                                <td>{attachment.name || "-"}</td>
                                                {/* <td>{attachment.type || "-"}</td> */}
                                                <td>{formatFileSize(attachment.size)}</td>
                                                {/* <td>{attachment.ownerName || "-"}</td> */}
                                                <td>
                                                    {attachment.createdTime
                                                        ? new Date(attachment.createdTime).toLocaleString()
                                                        : "-"}
                                                </td>
                                                <td className="text-end">
                                                    <div className="d-inline-flex gap-2">
                                                        <Button
                                                            variant="outline-secondary"
                                                            size="sm"
                                                            onClick={() => handleDownloadSingle(attachment)}
                                                            disabled={downloadingIds.has(attachment.id)}
                                                        >
                                                            {downloadingIds.has(attachment.id) ? "Downloading..." : "Download"}
                                                        </Button>
                                                        <Button
                                                            variant="outline-danger"
                                                            size="sm"
                                                            onClick={() => handleDeleteSingle(attachment.id)}
                                                            disabled={isDeleting}
                                                        >
                                                            Delete
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </Table>
                            )}
                        </Card.Body>
                    </Card>
                </Container>
            }
        </>
    );
}

export default App;