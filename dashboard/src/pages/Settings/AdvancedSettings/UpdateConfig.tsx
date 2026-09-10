import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Collapse } from "antd";
import {
  BookOpen,
  CheckCircle,
  Info,
  RefreshCw,
  XCircle,
  AlertTriangle,
  Power,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import {
  updateApi,
  UpdateStatus,
  UpgradeProgress,
} from "../../../api/modules/update";
import Markdown from "../../../components/Markdown/LazyMarkdown";
import { useServiceRestartContext } from "../../../context/ServiceRestartContext";
import {
  clearStoredUpdateStatus,
  storeUpdateStatus,
} from "../../../utils/updateStatusCache";
import { TabPanelHeader } from "./TabPanelHeader";
import styles from "./UpdateConfig.module.less";

/** 升级指引命令 —— 面向威小蜜AI 品牌版（源码 / git / uv 运行）。 */
/** 品牌 GitHub Releases 直链 —— 用于查看新版本说明与历史版本。 */
const BRAND_RELEASES_URL = "https://github.com/myveisun/myweixiaomi/releases";

const UPGRADE_GUIDE_CODE = {
  source: `cd Octop
# 品牌版源码更新（本机已配好 origin/upstream，需代理时先设代理）
git pull origin brand/veisun

# 构建控制台前端并同步 Python 依赖
make build-frontend
uv sync

# 重新启动服务（见下方「升级后重启」）`,
  cli: `# 拉取品牌最新代码
git fetch origin
git pull origin brand/veisun
make build-frontend
uv sync

# 重启服务
octop service restart   # 系统服务模式
# 或前台：uv run octop run`,
  restart: `# 系统服务（systemd / launchd / Windows 服务）
octop service restart

# 前台进程 —— 停掉旧进程后重新启动：
uv run octop run`,
} as const;

type GuideMethodKey = "source" | "cli" | "restart";

const GUIDE_METHOD_ORDER: GuideMethodKey[] = ["source", "cli", "restart"];

function codeFor(key: GuideMethodKey): string | null {
  return UPGRADE_GUIDE_CODE[key];
}

function UpgradeGuide() {
  const { t } = useTranslation();

  return (
    <section
      className={`${styles.panel} ${styles.guide}`}
      aria-label={t("advancedSettings.update.guideTitle")}
    >
      <div className={styles.panelTitleRow}>
        <span className={styles.panelTitleIcon}>
          <BookOpen size={16} />
        </span>
        <h3 className={styles.panelTitle}>
          {t("advancedSettings.update.guideTitle")}
        </h3>
      </div>
      <p className={styles.panelDesc}>
        {t("advancedSettings.update.guideIntro")}
      </p>
      <p className={styles.guideNote}>
        {t("advancedSettings.update.guideDataNote")}
      </p>
      <div className={styles.guideMethods}>
        {GUIDE_METHOD_ORDER.map((key) => {
          const code = codeFor(key);
          return (
            <div key={key} className={styles.guideMethod}>
              <p className={styles.guideMethodTitle}>
                {t(`advancedSettings.update.guide.${key}.title`)}
              </p>
              <p className={styles.guideMethodBody}>
                {t(`advancedSettings.update.guide.${key}.body`)}
              </p>
              {code && <pre className={styles.guideCode}>{code}</pre>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function UpdateConfig() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [progress, setProgress] = useState<UpgradeProgress | null>(null);
  const { restartPhase, isRestarting, requestRestart, executeRestart } =
    useServiceRestartContext();
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollFailRef = useRef(0);
  const autoRestartedRef = useRef(false);

  useEffect(() => {
    updateApi
      .getUpdateStatus()
      .then((next) => {
        storeUpdateStatus(next);
        setStatus(next);
      })
      .catch(() => {});
    return () => {
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (progress?.status !== "complete" || !status?.desktop) return;
    if (restartPhase !== "idle" || autoRestartedRef.current) return;
    autoRestartedRef.current = true;
    void executeRestart();
  }, [progress?.status, status?.desktop, restartPhase, executeRestart]);

  const handleCheck = useCallback(async () => {
    setChecking(true);
    try {
      const result = await updateApi.checkForUpdates();
      storeUpdateStatus(result);
      setStatus(result);
    } catch {
      // network error – keep existing status
    } finally {
      setChecking(false);
    }
  }, []);

  const pollProgress = useCallback(async (taskId: string) => {
    try {
      const prog = await updateApi.getUpgradeProgress(taskId);
      pollFailRef.current = 0;
      setProgress(prog);
      if (prog.status === "running") {
        pollTimerRef.current = setTimeout(() => pollProgress(taskId), 800);
      } else {
        setUpgrading(false);
        if (prog.status === "complete") {
          clearStoredUpdateStatus();
          updateApi
            .getUpdateStatus()
            .then((next) => {
              storeUpdateStatus(next);
              setStatus(next);
            })
            .catch(() => {});
        }
      }
    } catch (err: unknown) {
      pollFailRef.current += 1;
      if (pollFailRef.current < 5) {
        pollTimerRef.current = setTimeout(() => pollProgress(taskId), 800);
        return;
      }
      setUpgrading(false);
      const message = err instanceof Error ? err.message : String(err);
      setProgress({
        task_id: taskId,
        status: "error",
        stage: "error",
        percent: null,
        new_version: null,
        success: false,
        error: message,
        mirror_errors: null,
      });
    }
  }, []);

  const handleUpgrade = useCallback(async () => {
    setUpgrading(true);
    setProgress(null);
    pollFailRef.current = 0;
    autoRestartedRef.current = false;
    try {
      const started = await updateApi.triggerUpgrade();
      setProgress({
        task_id: started.task_id,
        status: "running",
        stage: "starting",
        percent: 0,
        new_version: null,
        success: null,
        error: null,
        mirror_errors: null,
      });
      pollProgress(started.task_id);
    } catch (err: unknown) {
      setUpgrading(false);
      const msg = err instanceof Error ? err.message : String(err);
      setProgress({
        task_id: "",
        status: "error",
        stage: null,
        percent: null,
        new_version: null,
        success: false,
        error: msg,
        mirror_errors: null,
      });
    }
  }, [pollProgress]);

  const stageLabel = (stage: string | null) => {
    switch (stage) {
      case "starting":
        return t("advancedSettings.update.stageStarting");
      case "downloading":
        return t("advancedSettings.update.stageDownloading");
      case "installing":
        return t("advancedSettings.update.stageInstalling");
      default:
        return t("advancedSettings.update.upgrading");
    }
  };

  const errorText = (e?: string | null) => {
    switch (e) {
      case "no_release_yet":
        return t("advancedSettings.update.noReleaseYet");
      case "could_not_reach_brand_update_source":
        return t("advancedSettings.update.couldNotReachSource");
      default:
        return e;
    }
  };

  const upgradeFinished =
    progress && (progress.status === "complete" || progress.status === "error");
  const isServiceMode = !!status?.service_mode;
  const restartUiLocked = restartPhase !== "idle" && restartPhase !== "timeout";

  return (
    <div className={styles.container}>
      <TabPanelHeader
        icon={<RefreshCw size={22} />}
        title={t("advancedSettings.update.title")}
        description={t("advancedSettings.update.description")}
      />

      <div className={styles.layout}>
        {/* In-place version check & upgrade */}
        <section
          className={styles.panel}
          aria-label={t("advancedSettings.update.panelTitle")}
        >
          <div className={styles.panelTitleRow}>
            <span className={styles.panelTitleIcon}>
              <Sparkles size={16} />
            </span>
            <h3 className={styles.panelTitle}>
              {t("advancedSettings.update.panelTitle")}
            </h3>
          </div>
          <p className={styles.panelDesc}>
            {t("advancedSettings.update.panelDesc")}
          </p>

          <div className={styles.versionGrid}>
            <div className={styles.versionCard}>
              <span className={styles.versionLabel}>
                {t("advancedSettings.update.currentVersion")}
              </span>
              <span className={styles.versionValue}>
                {status?.current_version ?? "—"}
              </span>
            </div>
            <div className={styles.versionCard}>
              <span className={styles.versionLabel}>
                {t("advancedSettings.update.latestVersion")}
              </span>
              <span className={styles.versionValue}>
                {status?.latest_version ?? (
                  <span className={styles.notChecked}>
                    {t("advancedSettings.update.notChecked")}
                  </span>
                )}
              </span>
              {status?.has_update && (
                <span className={styles.badge}>
                  {t("advancedSettings.update.updateAvailable")}
                </span>
              )}
            </div>
          </div>

          <p className={styles.checkSource}>
            {t("advancedSettings.update.checkSource")}
            <a
              className={styles.checkSourceLink}
              href={BRAND_RELEASES_URL}
              target="_blank"
              rel="noreferrer"
            >
              {t("advancedSettings.update.releasesLink")}
              <ExternalLink size={12} />
            </a>
          </p>

          {status?.is_editable && (
            <div className={`${styles.alert} ${styles.alertWarn}`}>
              <AlertTriangle size={15} />
              <span>{t("advancedSettings.update.editableHint")}</span>
            </div>
          )}

          {status?.error && (
            <div className={`${styles.alert} ${styles.alertError}`}>
              <XCircle size={15} />
              <span>
                {status.error_code
                  ? t(`advancedSettings.update.errors.${status.error_code}`, {
                      defaultValue: status.error,
                    })
                  : errorText(status.error)}
                <br />
                <a
                  className={styles.checkSourceLink}
                  href={BRAND_RELEASES_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("advancedSettings.update.releasesLink")}
                  <ExternalLink size={12} />
                </a>
              </span>
            </div>
          )}

          {status?.source && status.source !== "pypi.org" && !status.error && (
            <div className={`${styles.alert} ${styles.alertInfo}`}>
              <Info size={15} />
              <span>
                {t("advancedSettings.update.mirrorSource", {
                  source: status.source,
                })}
              </span>
            </div>
          )}

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleCheck}
              disabled={checking || upgrading || restartUiLocked}
            >
              <RefreshCw
                size={14}
                className={checking ? styles.spinning : undefined}
              />
              {checking
                ? t("advancedSettings.update.checking")
                : t("advancedSettings.update.checkButton")}
            </button>

            {isServiceMode && (
              <button
                type="button"
                className={styles.btnSecondary}
                onClick={requestRestart}
                disabled={checking || upgrading || restartUiLocked}
              >
                <Power size={14} />
                {isRestarting
                  ? t("advancedSettings.update.restarting")
                  : t("advancedSettings.update.restartServiceBtn")}
              </button>
            )}

            {status?.has_update && !status.is_editable && !upgradeFinished && (
              <button
                type="button"
                className={styles.btnPrimary}
                onClick={handleUpgrade}
                disabled={upgrading}
              >
                {upgrading
                  ? t("advancedSettings.update.upgrading")
                  : t("advancedSettings.update.upgradeButton")}
              </button>
            )}
          </div>

          {progress && (
            <div className={styles.progressSection}>
              {progress.status === "running" && (
                <>
                  <div className={styles.progressLabel}>
                    <RefreshCw size={13} className={styles.spinning} />
                    <span>{stageLabel(progress.stage)}</span>
                  </div>
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${progress.percent ?? 10}%` }}
                    />
                  </div>
                </>
              )}

              {progress.status === "complete" && (
                <>
                  <div className={`${styles.alert} ${styles.alertSuccess}`}>
                    <CheckCircle size={15} />
                    <span>
                      {t("advancedSettings.update.upgradeSuccess")}
                      {progress.new_version && ` → v${progress.new_version}`}
                    </span>
                  </div>

                  {restartPhase === "idle" &&
                    !status?.desktop &&
                    (isServiceMode ? (
                      <div className={`${styles.alert} ${styles.alertInfo}`}>
                        <AlertTriangle size={15} />
                        <div className={styles.restartRow}>
                          <p>{t("advancedSettings.update.restartHint")}</p>
                          <button
                            type="button"
                            className={styles.btnPrimary}
                            onClick={requestRestart}
                          >
                            <Power size={14} />
                            {t("advancedSettings.update.restartServiceBtn")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={`${styles.alert} ${styles.alertInfo}`}>
                        <AlertTriangle size={15} />
                        <div>
                          <p>{t("advancedSettings.update.restartHint")}</p>
                          <div className={styles.commandBlock}>
                            <code>octop service restart</code>
                            <span className={styles.commandSep}>/</span>
                            <code>octop run</code>
                          </div>
                        </div>
                      </div>
                    ))}
                </>
              )}

              {progress.status === "error" && (
                <div className={`${styles.alert} ${styles.alertError}`}>
                  <XCircle size={15} />
                  <div>
                    <p>
                      {t("advancedSettings.update.upgradeFailed")}:{" "}
                      {progress.error}
                    </p>
                    <p className={styles.manualHint}>
                      {t("advancedSettings.update.manualUpgradeHint")}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {status?.has_update && status.release_notes && (
            <Collapse
              className={styles.releaseNotes}
              defaultActiveKey={["changelog"]}
              items={[
                {
                  key: "changelog",
                  label: t("advancedSettings.update.releaseNotes"),
                  children: <Markdown content={status.release_notes} />,
                },
              ]}
            />
          )}
        </section>

        <UpgradeGuide />
      </div>
    </div>
  );
}
