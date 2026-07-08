UPDATE t_tray_cycles tc
SET status = 'COMPLETED',
    completed_at = COALESCE(tc.completed_at, NOW())
FROM t_qc_sessions qs
WHERE qs.tray_cycle_id = tc.id
  AND tc.status IN ('IN_PRODUCTION','WAITING_QC','QC_PROCESS')
  AND qs.status IN ('READY_FOR_LASER','LASER_COMPLETE','CANCELLED');
