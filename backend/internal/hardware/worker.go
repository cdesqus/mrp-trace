package hardware

import (
	"context"
	"fmt"
	"io"
	"net"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Devices map[string]string

type Worker struct {
	db      *pgxpool.Pool
	devices Devices
}

func NewWorker(db *pgxpool.Pool, devices Devices) *Worker {
	return &Worker{db: db, devices: devices}
}

func (w *Worker) Run(ctx context.Context) {
	ticker := time.NewTicker(400 * time.Millisecond)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			for i := 0; i < 4; i++ {
				if !w.processOne(ctx) {
					break
				}
			}
		}
	}
}

func (w *Worker) processOne(ctx context.Context) bool {
	tx, err := w.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return false
	}
	defer tx.Rollback(ctx)

	var id, entityID int64
	var role, payload, entityType string
	err = tx.QueryRow(ctx, `
		SELECT id, entity_id, entity_type, device_role, payload
		FROM t_print_jobs
		WHERE status IN ('QUEUED','FAILED') AND next_attempt_at <= NOW()
		ORDER BY id
		FOR UPDATE SKIP LOCKED
		LIMIT 1
	`).Scan(&id, &entityID, &entityType, &role, &payload)
	if err != nil {
		return false
	}
	if _, err = tx.Exec(ctx, `UPDATE t_print_jobs SET status='PROCESSING', attempts=attempts+1 WHERE id=$1`, id); err != nil {
		return false
	}
	if entityType == "LASER_BATCH" {
		if _, err = tx.Exec(ctx, `
			UPDATE t_laser_batches
			SET status='PROCESSING',transmission_attempts=transmission_attempts+1,
			    updated_at=NOW(),last_error=NULL
			WHERE id=$1
		`, entityID); err != nil {
			return false
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return false
	}

	err = Send(ctx, w.devices[role], []byte(payload))
	if err != nil {
		if entityType == "LASER_BATCH" {
			failTx, beginErr := w.db.Begin(ctx)
			if beginErr == nil {
				_, _ = failTx.Exec(ctx, `
					UPDATE t_print_jobs
					SET status='FAILED',last_error=$2,next_attempt_at='infinity'
					WHERE id=$1
				`, id, err.Error())
				_, _ = failTx.Exec(ctx, `
					UPDATE t_laser_batches
					SET status='FAILED',last_error=$2,updated_at=NOW()
					WHERE id=$1
				`, entityID, err.Error())
				_ = failTx.Commit(ctx)
			}
		} else {
			_, _ = w.db.Exec(ctx, `
				UPDATE t_print_jobs
				SET status='FAILED', last_error=$2,
				    next_attempt_at=NOW() + LEAST(INTERVAL '5 minutes', (attempts * INTERVAL '5 seconds'))
				WHERE id=$1
			`, id, err.Error())
		}
		return true
	}

	completeTx, err := w.db.Begin(ctx)
	if err != nil {
		return true
	}
	defer completeTx.Rollback(ctx)
	_, _ = completeTx.Exec(ctx, `
		UPDATE t_print_jobs SET status='PRINTED', printed_at=NOW(), last_error=NULL WHERE id=$1
	`, id)
	if role == "LASER" && entityType == "UNIT" {
		_, _ = completeTx.Exec(ctx, `
			UPDATE t_units_tracking
			SET status='QC_PENDING', laser_marked_at=NOW(), updated_at=NOW()
			WHERE id=$1 AND status='LASER_PENDING'
		`, entityID)
	}
	if role == "LASER" && entityType == "LASER_BATCH" {
		_, _ = completeTx.Exec(ctx, `
			UPDATE t_laser_batches
			SET status='SENT',sent_at=NOW(),updated_at=NOW(),last_error=NULL
			WHERE id=$1
		`, entityID)
		_, _ = completeTx.Exec(ctx, `
			UPDATE t_units_tracking u
			SET status='PASSED_UNBOXED',laser_marked_at=NOW(),qc_passed_at=NOW(),updated_at=NOW()
			FROM t_laser_batch_units lbu
			WHERE lbu.laser_batch_id=$1 AND lbu.unit_id=u.id AND u.status='LASER_PENDING'
		`, entityID)
		_, _ = completeTx.Exec(ctx, `
			UPDATE t_pre_laser_units pu SET status='LASER_MARKED'
			FROM t_laser_batch_units lbu
			WHERE lbu.laser_batch_id=$1 AND pu.commercial_unit_id=lbu.unit_id
		`, entityID)
		_, _ = completeTx.Exec(ctx, `
			UPDATE t_serial_groups sg SET status=CASE
			  WHEN (SELECT COUNT(*) FROM t_units_tracking u WHERE u.serial_group_id=sg.id)=sg.group_size
			   AND NOT EXISTS(SELECT 1 FROM t_units_tracking u WHERE u.serial_group_id=sg.id AND u.status<>'PASSED_UNBOXED')
			  THEN 'READY_TO_PACK' ELSE 'QC_PROCESS' END
			WHERE EXISTS (
				SELECT 1 FROM t_units_tracking u
				JOIN t_laser_batch_units lbu ON lbu.unit_id=u.id
				WHERE lbu.laser_batch_id=$1 AND u.serial_group_id=sg.id
			)
		`, entityID)
	}
	_ = completeTx.Commit(ctx)
	return true
}

func Send(ctx context.Context, address string, payload []byte) error {
	if address == "" {
		return fmt.Errorf("device address is not configured")
	}
	if address == "SIMULATE_SUCCESS" {
		return nil
	}
	if address == "SIMULATE_FAIL" {
		return fmt.Errorf("simulated device failure")
	}
	dialer := net.Dialer{Timeout: 3 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", address)
	if err != nil {
		return err
	}
	defer conn.Close()
	_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	for len(payload) > 0 {
		n, err := conn.Write(payload)
		if err != nil {
			return err
		}
		if n == 0 {
			return io.ErrShortWrite
		}
		payload = payload[n:]
	}
	return nil
}
