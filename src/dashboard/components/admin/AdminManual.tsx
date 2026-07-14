import {useEffect, useState} from "react";
import type {AdminManual as AdminManualMetadata} from "../../types/AdminManual.ts";
import type {AdminUser} from "../../types/AdminUser.ts";
import {ApiUtils} from "../../utils/ApiUtils.ts";
import AdminErrorScreen from "./AdminErrorScreen.tsx";
import AdminLoadingScreen from "./AdminLoadingScreen.tsx";
import AdminLoginScreen from "./AdminLoginScreen.tsx";
import AdminNav from "./AdminNav.tsx";
import AdminToast from "./AdminToast.tsx";
import styles from "./AdminManual.module.css";

interface AdminManualProps {
    loaded: boolean;
    loggedIn: boolean;
    error: string | undefined;
    adminUser: AdminUser | undefined;
    token: string | null;
}

const AdminManual = ({loaded, loggedIn, error, adminUser, token}: AdminManualProps) => {
    const [manual, setManual] = useState<AdminManualMetadata | undefined>(undefined);
    const [pdfUrl, setPdfUrl] = useState<string | undefined>(undefined);
    const [manualError, setManualError] = useState<string | undefined>(undefined);
    const [isLoadingManual, setIsLoadingManual] = useState(false);

    useEffect(() => {
        if (!token) {
            setManual(undefined);
            setPdfUrl(undefined);
            return;
        }

        let isCurrent = true;
        let objectUrl: string | undefined;
        setIsLoadingManual(true);
        setManualError(undefined);
        setManual(undefined);
        setPdfUrl(undefined);

        Promise.all([
            ApiUtils.getAdminManualMeta(token),
            ApiUtils.getAdminManualPdf(token),
        ])
            .then(([metadata, pdf]) => {
                if (!isCurrent) return;
                setManual(metadata);
                if (pdf) {
                    objectUrl = URL.createObjectURL(pdf);
                    setPdfUrl(objectUrl);
                } else {
                    setPdfUrl(undefined);
                }
            })
            .catch(err => {
                if (isCurrent) {
                    setManualError(err instanceof Error ? err.message : String(err));
                    setManual(undefined);
                    setPdfUrl(undefined);
                }
            })
            .finally(() => {
                if (isCurrent) setIsLoadingManual(false);
            });

        return () => {
            isCurrent = false;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
            }
        };
    }, [token]);

    if (!loggedIn) return <AdminLoginScreen/>;
    if (!loaded) return <AdminLoadingScreen/>;
    if (error) return <AdminErrorScreen content={error}/>;

    return (
        <div className={styles.adminManualContainer}>
            <AdminNav adminUser={adminUser}/>
            <header className={styles.manualHeader}>
                <div>
                    <h1>Mentor Manual</h1>
                </div>
                {pdfUrl && (
                    <div className={styles.manualActions}>
                        <a href={pdfUrl} target="_blank" rel="noreferrer">Open PDF</a>
                        <a href={pdfUrl} download={manual?.filename || "atcmh-manual.pdf"}>Download</a>
                    </div>
                )}
            </header>

            <AdminToast message={manualError} onDismiss={() => setManualError(undefined)}/>
            {isLoadingManual && <div className={styles.manualLoading}>Loading manual...</div>}

            {!isLoadingManual && !manualError && !manual && (
                <section className={styles.manualEmpty}>
                    <h2>No manual uploaded</h2>
                    <p>Use <code>/dashboard guide &lt;link&gt;</code> in Discord with a PDF file link to upload the current manual.</p>
                </section>
            )}

            {manual && (
                <>
                    <section className={styles.manualViewerPanel}>
                        {pdfUrl ? (
                            <object className={styles.manualViewer} data={pdfUrl} type="application/pdf">
                                <div className={styles.manualFallback}>
                                    <h2>PDF preview unavailable</h2>
                                    <p>Your browser could not show the embedded PDF. Use Open PDF or Download above.</p>
                                </div>
                            </object>
                        ) : (
                            <div className={styles.manualFallback}>
                                <h2>PDF preview unavailable</h2>
                                <p>The manual metadata loaded, but the PDF file could not be loaded.</p>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
};

export default AdminManual;
