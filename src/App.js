import './App.css';
import React, { useCallback, useEffect, useReducer, useState } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import { Col, Row, Button, Form, Container, Alert, Table, Card, ListGroup, Spinner, Badge } from 'react-bootstrap';
import axios from 'axios';
import { initialstate } from './Reducer/reducer';
import reducer from './Reducer/reducer';
export const ZOHO = window.ZOHO;

function App() {
    const [isOnline, setIsOnline] = useState();
    const [state, dispatch] = useReducer(reducer, initialstate);
    const [Entity, setEntity] = useState();
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
            // setEntityId(data.EntityId);
            setIsOnline(navigator.onLine);
            ZOHO.CRM.UI.Resize({ height: "650", width: "600" }).then(function (data) {
            });
            dispatch({ type: "SETPAGE", payload: data.ButtonPosition });
            dispatch({ type: "SETENTITYID", payload: data.EntityId });
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
        if (!state.entityname || !state.entityid) {
            return;
        }
        setAttachmentsLoading(true);
        setAttachmentsError("");
        setDownloadError("");
        try {
            const response = await ZOHO.CRM.API.getRelatedRecords({
                Entity: state.entityname,
                RecordID: state.entityid,
                RelatedList: "Attachments",
                page: 1,
                per_page: 200
            });
            const list = Array.isArray(response?.data)
                ? response.data
                : Array.isArray(response?.data?.data)
                    ? response.data.data
                    : [];
            console.log("Attachments API response:", response);
            const normalized = list
                .map((record) => normalizeAttachmentRecord(record))
                .filter((record) => record && record.id);
            setAttachments(normalized);
            persistSelection(normalized);
        } catch (error) {
            console.error("Failed to fetch attachments", error);
            setAttachmentsError("Unable to load attachments. Please try again.");
        } finally {
            setAttachmentsLoading(false);
        }
    }, [normalizeAttachmentRecord, persistSelection, state.entityid, state.entityname]);

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

    const triggerUrlDownload = (url, fileName) => {
        if (!url) {
            return false;
        }
        const link = document.createElement("a");
        link.href = url;
        link.rel = "noopener";
        link.target = "_blank";
        if (fileName) {
            link.download = fileName;
        }
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return true;
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
            if (!state.entityname || !state.entityid || !attachmentId) {
                return {};
            }
            try {
                const response = await ZOHO.CRM.HTTP.get({
                    url: `/crm/v5/${state.entityname}/${state.entityid}/Attachments/${attachmentId}`,
                    params: { download: true }
                });
                if (!response) {
                    return {};
                }
                const headers = response.headers || response.header || {};
                const nameFromHeader =
                    parseFileNameFromDisposition(headers["Content-Disposition"]) ||
                    parseFileNameFromDisposition(headers["content-disposition"]);
                return {
                    content: response.body || response.response || "",
                    type: headers["Content-Type"] || headers["content-type"] || "application/octet-stream",
                    name: nameFromHeader
                };
            } catch (error) {
                console.error("Fallback download failed", error);
                return {};
            }
        },
        [state.entityid, state.entityname]
    );

    const fetchAttachmentPayload = useCallback(
        async (attachment) => {
            if (!attachment?.id) {
                return {};
            }

            const fetchers = [
                async () => {
                    const response = await ZOHO.CRM.API.getFile({ id: attachment.id });
                    return extractFilePayload(response);
                },
                async () => fetchAttachmentViaHttp(attachment.id),
                async () => {
                    if (!attachment.downloadUrl) {
                        return {};
                    }
                    const response = await ZOHO.CRM.HTTP.get({
                        url: attachment.downloadUrl.startsWith("/crm/")
                            ? attachment.downloadUrl
                            : `/crm/v5/${state.entityname}/${state.entityid}/Attachments/${attachment.id}`,
                        params: attachment.downloadUrl.includes("download=") ? {} : { download: true }
                    });
                    if (!response) {
                        return {};
                    }
                    return extractFilePayload(response);
                }
            ];

            for (const fetcher of fetchers) {
                try {
                    // eslint-disable-next-line no-await-in-loop
                    const response = await fetcher();
                    if (response?.content || response?.downloadUrl) {
                        return response;
                    }
                } catch (fetchError) {
                    console.warn("Attachment fetch attempt failed", fetchError);
                }
            }

            return {};
        },
        [fetchAttachmentViaHttp, state.entityid, state.entityname]
    );

    const downloadAttachment = useCallback(
        async (attachment) => {
            if (!attachment?.id) {
                return false;
            }
            const fallbackName =
                attachment.name && attachment.name !== "-" ? attachment.name : `Attachment_${attachment.id}`;
            if (attachment.linkUrl) {
                triggerUrlDownload(
                    attachment.linkUrl,
                    attachment.name && attachment.name !== "-" ? attachment.name : undefined
                );
                return true;
            }
            if (attachment.downloadUrl) {
                triggerUrlDownload(
                    attachment.downloadUrl,
                    attachment.name && attachment.name !== "-" ? attachment.name : undefined
                );
                return true;
            }
            updateDownloadingIds(attachment.id, true);
            try {
                const payload = await fetchAttachmentPayload(attachment);
                if (payload.downloadUrl) {
                    triggerUrlDownload(payload.downloadUrl, payload.name || fallbackName);
                    return true;
                }
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
        if (!ids.length || !state.entityname || !state.entityid) {
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
            {state.page === "DetailView" &&
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