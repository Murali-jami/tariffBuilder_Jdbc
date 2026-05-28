package com.xius.TariffBuilder.UserService;

import java.sql.Date;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.BeanPropertyRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

import com.xius.TariffBuilder.Dto.TariffPackageDetails;
import com.xius.TariffBuilder.Entity.SaveConfigDao;
import com.xius.TariffBuilder.UserService.BundleService.CloneAtpResult;
import com.xius.TariffBuilder.UserService.ServiceCloneService.CloneServiceResult;
import com.xius.TariffBuilder.exception.TariffInsertException;
import com.xius.TariffBuilder.util.JsonStorage;

@Service
public class TariffApprovalService {

    private static final Logger logger = LoggerFactory.getLogger(TariffApprovalService.class);
    private static final DateTimeFormatter formatter = DateTimeFormatter.ofPattern("MM/dd/yyyy");

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JsonStorage jsonStorage;

    @Autowired
    private ServiceCloneService serviceCloneService;

    @Autowired
    private BundleService bundleService;

    @Autowired
    private ServiceplanZone servicePlanZone;

    @Autowired
    private SaveConfigDao saveConfigDao;

    @Autowired
    private PlatformTransactionManager transactionManager;

    // =====================================================
    // APPROVE TARIFF
    // =====================================================
    public Map<String, Object> approve(String tpName) {

        long startTime = System.currentTimeMillis();
        logger.info("Approve request received tpName={}", tpName);

        Map<String, Object> json = (Map<String, Object>) jsonStorage.getTpData(tpName);
        if (json == null) {
            Map<String, Object> err = new HashMap<>();
            err.put("status", "error");
            err.put("message", "JSON NOT FOUND for tpName=" + tpName);
            return err;
        }

        Map<String, Object> data = (Map<String, Object>) json.get("data");
        Long networkId = Long.valueOf(json.get("networkId").toString());
        String username = json.get("username").toString();

        logger.info("Approve payload tpName={} networkId={} username={}", tpName, networkId, username);

        DefaultTransactionDefinition def = new DefaultTransactionDefinition();
        def.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        TransactionStatus status = transactionManager.getTransaction(def);

        try {
            Map<String, Object> result = executeTariffCreation(data, tpName, networkId, username);
            transactionManager.commit(status);
            removeFromJson(tpName);
            result.put("status", "success");
            long time = System.currentTimeMillis() - startTime;
            logger.info("Tariff approved tpName={} executionTime={}ms", tpName, time);
            return result;
        } catch (TariffInsertException tie) {
            transactionManager.rollback(status);
            logger.error("TariffInsertException during approve tpName={}", tpName, tie);
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("status", "error");
            err.put("message", "Error inserting into " + tie.getFailedTable() + " at " + tie.getStep() + ": "
                    + (tie.getCause() != null ? tie.getCause().getMessage() : tie.getMessage()));
            err.put("failedStep", tie.getStep());
            err.put("failedTable", tie.getFailedTable());
            return err;
        } catch (Exception ex) {
            transactionManager.rollback(status);
            logger.error("Approve failed tpName={}", tpName, ex);
            Map<String, Object> err = new HashMap<>();
            err.put("status", "error");
            err.put("message", ex.getMessage() != null ? ex.getMessage() : "Unexpected error during approve");
            return err;
        }
    }

    // =====================================================
    // CLONE TARIFF
    // =====================================================
    public Map<String, Object> clone(Map<String, Object> requestBody) {

        long startTime = System.currentTimeMillis();

        String originalTpName = requestBody.get("tpName").toString();
        Long networkId = Long.valueOf(requestBody.get("networkId").toString());
        String username = requestBody.get("username").toString();
        String cloneMode = requestBody.containsKey("cloneMode") ? requestBody.get("cloneMode").toString() : "direct";

        logger.info("Clone request received originalTpName={} networkId={} username={} cloneMode={}",
                originalTpName, networkId, username, cloneMode);

        Map<String, Object> originalData = (Map<String, Object>) requestBody.get("data");

        String clonedTpName;
        String clonedPublicityId;

        if ("modify".equals(cloneMode)
                && requestBody.containsKey("overrideTpName")
                && requestBody.containsKey("overridePublicityId")) {
            // MODE B — use override values as-is
            clonedTpName = requestBody.get("overrideTpName").toString();
            clonedPublicityId = requestBody.get("overridePublicityId").toString();
            logger.info("Clone modify mode: clonedTpName={} clonedPublicityId={}", clonedTpName, clonedPublicityId);
        } else {
            // MODE A — direct clone, append _CLn
            int cloneNumber = resolveNextCloneNumber(originalTpName, networkId);
            String cloneSuffix = "_CL" + cloneNumber;
            clonedTpName = originalTpName + cloneSuffix;
            String originalPublicityId = originalData.get("publicityId").toString();
            clonedPublicityId = originalPublicityId + cloneSuffix;
            logger.info("Clone direct mode: cloneSuffix={} clonedTpName={} clonedPublicityId={}",
                    cloneSuffix, clonedTpName, clonedPublicityId);
        }

        // Deep-copy and mutate the data map
        Map<String, Object> clonedData = new HashMap<>(originalData);
        clonedData.put("publicityId", clonedPublicityId);
        clonedData.put("tariffPackageDesc", clonedTpName);
        // chargeIds for ATPs will be regenerated server-side (no top-level chargeId)

        DefaultTransactionDefinition def = new DefaultTransactionDefinition();
        def.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
        TransactionStatus status = transactionManager.getTransaction(def);

        try {
            Map<String, Object> result = executeTariffCreation(clonedData, clonedTpName, networkId, username);
            transactionManager.commit(status);
            result.put("status", "success");
            result.put("clonedTpName", clonedTpName);
            result.put("clonedPublicityId", clonedPublicityId);
            long time = System.currentTimeMillis() - startTime;
            logger.info("Tariff cloned clonedTpName={} executionTime={}ms", clonedTpName, time);
            return result;
        } catch (TariffInsertException tie) {
            transactionManager.rollback(status);
            logger.error("TariffInsertException during clone clonedTpName={}", clonedTpName, tie);
            Map<String, Object> err = new LinkedHashMap<>();
            err.put("status", "error");
            err.put("message", "Error inserting into " + tie.getFailedTable() + " at " + tie.getStep() + ": "
                    + (tie.getCause() != null ? tie.getCause().getMessage() : tie.getMessage()));
            err.put("failedStep", tie.getStep());
            err.put("failedTable", tie.getFailedTable());
            return err;
        } catch (Exception ex) {
            transactionManager.rollback(status);
            logger.error("Clone failed clonedTpName={}", clonedTpName, ex);
            Map<String, Object> err = new HashMap<>();
            err.put("status", "error");
            err.put("message", ex.getMessage() != null ? ex.getMessage() : "Unexpected error during clone");
            return err;
        }
    }

    // =====================================================
    // VALIDATE endpoint logic (CHANGE 6)
    // =====================================================
    public Map<String, Object> validateClone(Long networkId, String tpName, String publicityId) {
        Map<String, Object> response = new LinkedHashMap<>();
        if (saveConfigDao.checkTariffExists(networkId, tpName)) {
            response.put("status", "error");
            response.put("message", "Tariff Package already exists in DB: " + tpName);
            return response;
        }
        if (saveConfigDao.checkPublicityExists(networkId, publicityId)) {
            response.put("status", "error");
            response.put("message", "Publicity ID already mapped in DB: " + publicityId);
            return response;
        }
        response.put("status", "success");
        response.put("message", "Validation passed");
        return response;
    }

    // =====================================================
    // RESOLVE NEXT CLONE NUMBER
    // =====================================================
    private int resolveNextCloneNumber(String originalTpName, Long networkId) {
        List<String> existingDescs = jdbcTemplate.queryForList("""
                select TARIFF_PACKAGE_DESC
                from CS_RAT_TARIFF_PACKAGE
                where NETWORK_ID = ?
                and TARIFF_PACKAGE_DESC like ?
                """,
                String.class,
                networkId,
                originalTpName + "_CL%");

        String prefix = originalTpName + "_CL";
        int max = 0;

        for (String desc : existingDescs) {
            if (desc.startsWith(prefix)) {
                String tail = desc.substring(prefix.length());
                try {
                    int n = Integer.parseInt(tail);
                    if (n > max) max = n;
                } catch (NumberFormatException ignored) {}
            }
        }

        logger.info("resolveNextCloneNumber originalTpName={} networkId={} existingMax={} nextNumber={}",
                originalTpName, networkId, max, max + 1);
        return max + 1;
    }

    // =====================================================
    // REJECT TARIFF
    // =====================================================
    public Map<String, Object> reject(String tpName) {
        Map<String, Object> json = (Map<String, Object>) jsonStorage.getTpData(tpName);
        if (json == null) {
            Map<String, Object> err = new HashMap<>();
            err.put("status", "error");
            err.put("message", "JSON NOT FOUND for tpName=" + tpName);
            return err;
        }
        removeFromJson(tpName);
        logger.info("Tariff rejected successfully tpName={}", tpName);
        Map<String, Object> result = new HashMap<>();
        result.put("status", "success");
        result.put("message", "Tariff rejected successfully");
        return result;
    }

    // =====================================================
    // SHARED CORE: executeTariffCreation
    // =====================================================
    private Map<String, Object> executeTariffCreation(
            Map<String, Object> data,
            String tpName,
            Long networkId,
            String username) {

        // Shared counter for chargeId generation: tpName_PR1, tpName_PR2, ...
        // Resets per tariff creation call.
        AtomicInteger prCounter = new AtomicInteger(0);

        try {
            // ── STEP 1 ──────────────────────────────────────────────────────
            Long oldServicePackageId = Long.valueOf(data.get("tariffPlanId").toString());
            Long oldPlanId = serviceCloneService.getOldPlanId(networkId, oldServicePackageId);
            if (oldPlanId == null) {
                throw new RuntimeException("Old plan not found for packageId=" + oldServicePackageId);
            }
            Long oldPlanZoneId = serviceCloneService.getPlanZoneId(oldPlanId);

            // ── STEP 2 ──────────────────────────────────────────────────────
            List<Map<String, Object>> defaultAtps = (List<Map<String, Object>>) data.get("defaultAtps");
            List<Map<String, Object>> addAtps = (List<Map<String, Object>>) data.get("allowedAtps");

            boolean hasDefaultAtps = defaultAtps != null && !defaultAtps.isEmpty();
            boolean hasAllowedAtps = addAtps != null && !addAtps.isEmpty();
            boolean hasAnyAtps = hasDefaultAtps || hasAllowedAtps;

            logger.info("ATP presence check hasDefaultAtps={} hasAllowedAtps={} hasAnyAtps={}",
                    hasDefaultAtps, hasAllowedAtps, hasAnyAtps);

            Long oldBucketZoneId = null;

            if (hasAnyAtps) {
                List<Map<String, Object>> firstAtpList = hasDefaultAtps ? defaultAtps : addAtps;
                Long firstOldAtpId = Long.valueOf(firstAtpList.get(0).get("servicePackageId").toString());
                String oldBucketId = bundleService.getOldBucketId(firstOldAtpId, networkId);
                if (oldBucketId == null) {
                    throw new RuntimeException("Old bucket not found for ATP=" + firstOldAtpId);
                }
                oldBucketZoneId = bundleService.getBucketZoneId(oldBucketId);
                logger.info("Old mapping oldPlanId={} oldPlanZoneId={} oldBucketId={} oldBucketZoneId={}",
                        oldPlanId, oldPlanZoneId, oldBucketId, oldBucketZoneId);
            } else {
                logger.info("No ATPs present. Skipping bucket zone resolution.");
            }

            // ── STEP 3 ──────────────────────────────────────────────────────
            Long newPlanZoneId;
            Long newBucketZoneId;

            if (hasAnyAtps) {
                if (oldPlanZoneId != null && oldPlanZoneId.equals(oldBucketZoneId)) {
                    Long newZoneId = servicePlanZone.generateNewZoneId();
                    newPlanZoneId = newZoneId;
                    newBucketZoneId = newZoneId;
                    servicePlanZone.cloneZoneIfExists(oldPlanZoneId, newZoneId, networkId, tpName);
                } else {
                    newPlanZoneId = servicePlanZone.generateNewZoneId();
                    servicePlanZone.cloneZoneIfExists(oldPlanZoneId, newPlanZoneId, networkId, tpName);
                    newBucketZoneId = servicePlanZone.generateNewZoneId();
                    servicePlanZone.cloneZoneIfExists(oldBucketZoneId, newBucketZoneId, networkId, tpName);
                }
            } else {
                newPlanZoneId = servicePlanZone.generateNewZoneId();
                servicePlanZone.cloneZoneIfExists(oldPlanZoneId, newPlanZoneId, networkId, tpName);
                newBucketZoneId = null;
                logger.info("No ATPs present. newPlanZoneId={} newBucketZoneId=null.", newPlanZoneId);
            }

            // ── STEP 4 ──────────────────────────────────────────────────────
            CloneServiceResult serviceResult = serviceCloneService.cloneService(
                    networkId, oldServicePackageId, tpName, newPlanZoneId);

            Long newServicePackageId = serviceResult.getNewPackageId();
            Long newServicePlanId = serviceResult.getNewPlanId();

            logger.info("Base service cloned newServicePackageId={} newServicePlanId={}",
                    newServicePackageId, newServicePlanId);

            // ── STEP 5 ──────────────────────────────────────────────────────
            List<Long> defaultAtpIds = new ArrayList<>();
            List<Long> allowedAtpIds = new ArrayList<>();
            List<Long> newAtpIds = new ArrayList<>();

            // Generate chargeIds for each ATP and attach to the ATP map
            if (hasAnyAtps) {
                if (hasDefaultAtps) {
                    for (Map<String, Object> atp : defaultAtps) {
                        String chargeId = tpName + "_PR" + prCounter.incrementAndGet();
                        atp.put("chargeId", chargeId);
                        Long oldAtpId = Long.valueOf(atp.get("servicePackageId").toString());
                        CloneAtpResult atpResult = bundleService.cloneAtpData(oldAtpId, networkId, tpName, newBucketZoneId);
                        defaultAtpIds.add(atpResult.getNewAtpId());
                        newAtpIds.add(atpResult.getNewAtpId());
                        logger.info("Default ATP cloned oldAtpId={} newAtpId={} chargeId={}",
                                oldAtpId, atpResult.getNewAtpId(), chargeId);
                    }
                }

                if (hasAllowedAtps) {
                    for (Map<String, Object> atp : addAtps) {
                        String chargeId = tpName + "_PR" + prCounter.incrementAndGet();
                        atp.put("chargeId", chargeId);
                        Long oldAtpId = Long.valueOf(atp.get("servicePackageId").toString());
                        CloneAtpResult atpResult = bundleService.cloneAtpData(oldAtpId, networkId, tpName, newBucketZoneId);
                        allowedAtpIds.add(atpResult.getNewAtpId());
                        newAtpIds.add(atpResult.getNewAtpId());
                        logger.info("Allowed ATP cloned oldAtpId={} newAtpId={} chargeId={}",
                                oldAtpId, atpResult.getNewAtpId(), chargeId);
                    }
                }
            } else {
                logger.info("No ATPs present. Skipping bundle and bucket clone.");
            }

            logger.info("Final defaultAtpIds={} allowedAtpIds={}", defaultAtpIds, allowedAtpIds);

            // ── STEP 6: Periodic charge — one insert per ATP (CHANGE 8) ─────
            if (hasDefaultAtps) {
                for (Map<String, Object> atp : defaultAtps) {
                    insertPeriodicChargeForAtp(atp, data, networkId, username);
                }
            }
            if (hasAllowedAtps) {
                for (Map<String, Object> atp : addAtps) {
                    insertPeriodicChargeForAtp(atp, data, networkId, username);
                }
            }
            if (!hasAnyAtps) {
                logger.info("No ATPs. Skipping periodic charge insert.");
            }

            // ── STEP 7: Create tariff package (no CHARGE_ID column) ─────────
            Long tariffId;
            try {
                tariffId = jdbcTemplate.queryForObject(
                        "select SEQ_TARIFF_PACK_ID.nextval from dual", Long.class);

                jdbcTemplate.update("""
                        insert into CS_RAT_TARIFF_PACKAGE
                        (
                            TARIFF_PACKAGE_ID,
                            TARIFF_PACKAGE_DESC,
                            NETWORK_ID,
                            END_DATE,
                            PUBLICITY_ID,
                            PACKAGE_TYPE,
                            IS_CORPORATE_YN,
                            TARIFF_PACK_CATEGORY
                        )
                        values (?,?,?,?,?,?,?,?)
                        """,
                        tariffId,
                        data.get("tariffPackageDesc"),
                        networkId,
                        Date.valueOf(LocalDate.parse(data.get("endDate").toString(), formatter)),
                        data.get("publicityId"),
                        data.get("packageType"),
                        convertYN(data.get("isCorporateYn")),
                        data.get("tariffPackCategory"));
            } catch (Exception ex) {
                throw new TariffInsertException("STEP 7", "CS_RAT_TARIFF_PACKAGE", ex);
            }

            // ── STEP 8: Publicity mapping ────────────────────────────────────
            try {
                jdbcTemplate.update("""
                        insert into CS_RAT_TPID_VS_PUBLICITYID
                        (
                            NETWORK_ID,
                            TARIFF_PACKAGE_ID,
                            TARIFF_PACKAGE_DESC,
                            PUBLICITY_ID,
                            RECORD_INSERTED_BY,
                            REC_INSERTED_DATE
                        )
                        values (?,?,?,?,?,sysdate)
                        """,
                        networkId,
                        tariffId,
                        data.get("tariffPackageDesc"),
                        data.get("publicityId"),
                        username);
            } catch (Exception ex) {
                throw new TariffInsertException("STEP 8", "CS_RAT_TPID_VS_PUBLICITYID", ex);
            }

            // ── STEP 9: Map tariff to base service package ───────────────────
            try {
                jdbcTemplate.update("""
                        insert into CS_RAT_TARIFF_SERVICE_PACK_MAP
                        (
                            TARIFF_PACKAGE_ID,
                            SERVICE_PACKAGE_ID,
                            NETWORK_ID,
                            TARIFF_PLAN_TYPE
                        )
                        values (?,?,?,?)
                        """,
                        tariffId, newServicePackageId, networkId, "TP");
            } catch (Exception ex) {
                throw new TariffInsertException("STEP 9", "CS_RAT_TARIFF_SERVICE_PACK_MAP", ex);
            }

            // ── STEP 10: Map tariff to ATPs (use per-ATP chargeId) ───────────
            int datpIdx = 0;
            for (Long atpId : defaultAtpIds) {
                String atpChargeId = defaultAtps.get(datpIdx).get("chargeId").toString();
                try {
                    jdbcTemplate.update("""
                            insert into CS_RAT_TARIFF_SERVICE_PACK_MAP
                            (
                                TARIFF_PACKAGE_ID,
                                SERVICE_PACKAGE_ID,
                                NETWORK_ID,
                                TARIFF_PLAN_TYPE,
                                CHARGE_ID,
                                PRIORITY,
                                SERVICE_DURATION
                            )
                            values (?,?,?,?,?,?,?)
                            """,
                            tariffId, atpId, networkId, "DATP", atpChargeId, 1, 30);
                } catch (Exception ex) {
                    throw new TariffInsertException("STEP 10", "CS_RAT_TARIFF_SERVICE_PACK_MAP(DATP)", ex);
                }
                datpIdx++;
            }

            int aatpIdx = 0;
            for (Long atpId : allowedAtpIds) {
                String atpChargeId = addAtps.get(aatpIdx).get("chargeId").toString();
                try {
                    jdbcTemplate.update("""
                            insert into CS_RAT_TARIFF_SERVICE_PACK_MAP
                            (
                                TARIFF_PACKAGE_ID,
                                SERVICE_PACKAGE_ID,
                                NETWORK_ID,
                                TARIFF_PLAN_TYPE,
                                CHARGE_ID,
                                PRIORITY,
                                SERVICE_DURATION
                            )
                            values (?,?,?,?,?,?,?)
                            """,
                            tariffId, atpId, networkId, "AATP", atpChargeId, 1, 30);
                } catch (Exception ex) {
                    throw new TariffInsertException("STEP 10", "CS_RAT_TARIFF_SERVICE_PACK_MAP(AATP)", ex);
                }
                aatpIdx++;
            }

            Map<String, Object> response = new HashMap<>();
            response.put("tariffPackageId", tariffId);
            response.put("newServicePackageId", newServicePackageId);
            response.put("newServicePlanId", newServicePlanId);
            response.put("newAtpIds", newAtpIds);
            response.put("newPlanZoneId", newPlanZoneId);
            response.put("newBucketZoneId", newBucketZoneId);
            return response;

        } catch (TariffInsertException tie) {
            throw tie;
        } catch (Exception ex) {
            logger.error("Tariff creation failed tpName={} error={}", tpName, ex.getMessage(), ex);
            throw ex;
        }
    }

    // ── CHANGE 8: insert one row per ATP ─────────────────────────────────────
    private void insertPeriodicChargeForAtp(
            Map<String, Object> atp,
            Map<String, Object> data,
            Long networkId,
            String username) {

        String chargeId = atp.get("chargeId").toString();

        Integer count = jdbcTemplate.queryForObject("""
                select count(*)
                from CS_RAT_PERIODIC_CHARGE_INFO
                where CHARGE_ID = ?
                and NETWORK_ID = ?
                """, Integer.class, chargeId, networkId);

        if (count != null && count > 0) {
            logger.info("Periodic charge already exists chargeId={}", chargeId);
            return;
        }

        Object validityDaysRaw = atp.get("rentalPeriod");
        Object rentalPeriod;
        if ("O".equals(atp.get("validity"))
                && validityDaysRaw != null
                && !validityDaysRaw.toString().trim().isEmpty()) {
            try {
                rentalPeriod = Integer.parseInt(validityDaysRaw.toString().trim());
            } catch (NumberFormatException e) {
                rentalPeriod = 1;
            }
        } else {
            rentalPeriod = 1;
        }

        try {
            jdbcTemplate.update("""
                    insert into CS_RAT_PERIODIC_CHARGE_INFO
                    (
                        CHARGE_ID,
                        CHARGE_DESC,
                        NETWORK_ID,
                        SERVICE_TYPE,
                        RENTAL_TYPE,
                        RENTAL_PERIOD,
                        ACTIVATION_FEE,
                        RENTAL_FEE,
                        RENTAL_FREE_CYCLES,
                        AUTO_RENEWAL,
                        PLAN_EXP_MIDNIGHT_YN,
                        MAX_RENEWAL_COUNT,
                        CREATED_BY
                    )
                    values (?,?,?,?,?,?,?,?,?,?,?,?,?)
                    """,
                    chargeId, chargeId, networkId, data.get("tariffPlanId"),
                    atp.get("validity"), rentalPeriod, data.get("charge"), atp.get("rental"),
                    atp.get("freeCycles"), convertYN(atp.get("renewal")),
                    convertYN(atp.get("midnightExpiry")), atp.get("maxCount"), username);
        } catch (Exception ex) {
            throw new TariffInsertException("STEP 6", "CS_RAT_PERIODIC_CHARGE_INFO", ex);
        }
    }

    private String convertYN(Object value) {
        if (value == null) return "N";
        String v = value.toString();
        if (v.equalsIgnoreCase("Y") || v.equalsIgnoreCase("YES") || v.equalsIgnoreCase("TRUE")) return "Y";
        return "N";
    }

    private void removeFromJson(String tpName) {
        Map<String, Object> json = (Map<String, Object>) jsonStorage.readAll();
        json.remove(tpName);
        jsonStorage.writeAll(json);
        logger.info("TP removed from json storage tpName={}", tpName);
    }

    public Map<String, Object> getTariffPackageDetails(Long tariffPackageId, Long networkId) {

        String sql = """
                SELECT
                    tp.TARIFF_PACKAGE_ID        AS tariffPackageId,
                    tp.TARIFF_PACKAGE_DESC      AS tariffPackageDesc,
                    tp.PUBLICITY_ID             AS publicityId,
                    tp.CHARGE_ID                AS chargeId,
                    tp.DISCOUNT_ON_RENTAL_YN    AS discountOnRentalYn,
                    tp.PACKAGE_TYPE             AS packageType,
                    tp.IS_CORPORATE_YN          AS isCorporateYn,
                    tp.TARIFF_PACK_CATEGORY     AS tariffPackCategory,
                    tp.END_DATE                 AS endDate,
                    tp.NETWORK_ID               AS networkId,
                    tspm.SERVICE_PACKAGE_ID     AS servicePackageId,
                    tspm.TARIFF_PLAN_TYPE       AS tariffPlanType,
                    tspm.CHARGE_ID              AS spChargeId,
                    sp.SERVICE_PACKAGE_DESC     AS servicePackageDesc,
                    sp.ACTIVATION_CHARGE        AS spActivationFee,
                    spp.SERVICE_PLAN_ID         AS servicePlanId,
                    pci.CHARGE_DESC             AS chargeDesc,
                    pci.RENTAL_TYPE             AS rentalType,
                    pci.RENTAL_PERIOD           AS rentalPeriod,
                    pci.ACTIVATION_FEE          AS activationFee,
                    pci.RENTAL_FEE              AS rentalFee,
                    pci.RENTAL_FREE_CYCLES      AS rentalFreeCycles,
                    pci.AUTO_RENEWAL            AS autoRenewal,
                    pci.PLAN_EXP_MIDNIGHT_YN    AS planExpMidnightYn,
                    pci.MAX_RENEWAL_COUNT       AS maxRenewalCount,
                    pci.CREATED_BY              AS createdBy
                FROM CS_RAT_TARIFF_PACKAGE tp
                LEFT JOIN CS_RAT_TARIFF_SERVICE_PACK_MAP tspm
                       ON tp.TARIFF_PACKAGE_ID = tspm.TARIFF_PACKAGE_ID
                      AND tp.NETWORK_ID = tspm.NETWORK_ID
                LEFT JOIN CS_RAT_SERVICE_PACKAGE sp
                       ON tspm.SERVICE_PACKAGE_ID = sp.SERVICE_PACKAGE_ID
                      AND sp.NETWORK_ID = tp.NETWORK_ID
                LEFT JOIN CS_RAT_SERVICE_PLAN_PACKAGE spp
                       ON tspm.SERVICE_PACKAGE_ID = spp.SERVICE_PACKAGE_ID
                      AND spp.NETWORK_ID = tp.NETWORK_ID
                LEFT JOIN (
                    SELECT
                        CHARGE_ID, NETWORK_ID, CHARGE_DESC, RENTAL_TYPE, RENTAL_PERIOD,
                        ACTIVATION_FEE, RENTAL_FEE, RENTAL_FREE_CYCLES, AUTO_RENEWAL,
                        PLAN_EXP_MIDNIGHT_YN, MAX_RENEWAL_COUNT, CREATED_BY,
                        ROW_NUMBER() OVER(PARTITION BY CHARGE_ID, NETWORK_ID ORDER BY ROWNUM) rn
                    FROM CS_RAT_PERIODIC_CHARGE_INFO
                ) pci
                    ON tspm.CHARGE_ID = pci.CHARGE_ID
                   AND tp.NETWORK_ID = pci.NETWORK_ID
                   AND pci.rn = 1
                WHERE tp.TARIFF_PACKAGE_ID = ?
                  AND tp.NETWORK_ID = ?
                ORDER BY
                    CASE tspm.TARIFF_PLAN_TYPE
                        WHEN 'TP' THEN 1
                        WHEN 'DATP' THEN 2
                        WHEN 'AATP' THEN 3
                        ELSE 4
                    END
                """;

        List<TariffPackageDetails> list = jdbcTemplate.query(sql,
                new BeanPropertyRowMapper<>(TariffPackageDetails.class), tariffPackageId, networkId);

        if (list == null || list.isEmpty()) return Collections.emptyMap();

        TariffPackageDetails first = list.get(0);
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("tpName", first.getTariffPackageDesc());
        response.put("username", first.getCreatedBy());
        response.put("networkId", first.getNetworkId());

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("username", first.getCreatedBy());
        data.put("isUpdate", true);
        data.put("submittedOn", LocalDate.now().format(DateTimeFormatter.ofPattern("dd MMM yyyy")));
        data.put("packageType", first.getPackageType());
        data.put("tariffPackCategory", first.getTariffPackCategory());
        data.put("tariffPackageDesc", first.getTariffPackageDesc());
        data.put("charge", first.getActivationFee() != null ? String.valueOf(first.getActivationFee()) : "");
        data.put("endDate", first.getEndDate() != null
                ? LocalDate.parse(first.getEndDate().toString().substring(0, 10))
                        .format(DateTimeFormatter.ofPattern("MM/dd/yyyy"))
                : "");
        data.put("publicityId", first.getPublicityId());
        data.put("discountOnRentalYn", "Y".equalsIgnoreCase(first.getDiscountOnRentalYn()));
        data.put("isCorporateYn", "Y".equalsIgnoreCase(first.getIsCorporateYn()));

       List<Map<String, Object>> defaultAtps = new ArrayList<>();
List<Map<String, Object>> allowedAtps = new ArrayList<>();

Set<Long> seenDefaultAtpIds = new LinkedHashSet<>();
Set<Long> seenAllowedAtpIds = new LinkedHashSet<>();

Set<String> selectedSvcs_s2 = new LinkedHashSet<>();
Set<String> selectedSvcs_s3 = new LinkedHashSet<>();
Set<String> selectedSvcs_s4 = new LinkedHashSet<>();

Set<String> ALLOWED_SERVICES =
        Set.of("VOICE", "SMS", "DATA");

for (TariffPackageDetails row : list) {

    String planType = row.getTariffPlanType();

    if (planType == null) {
        continue;
    }

    Long servicePackageId = row.getServicePackageId();

    // TP
    if ("TP".equalsIgnoreCase(planType)) {

        List<String> tpServices =
                jdbcTemplate.queryForList("""
                    SELECT DISTINCT
                        DECODE(
                            c.TYPE_OF_SERVICE,
                            1,'VOICE',
                            2,'SMS',
                            3,'DATA'
                        )
                    FROM CS_RAT_TARIFF_SERVICE_PACK_MAP a
                    JOIN CS_RAT_SERVICE_PLAN_PACKAGE b
                        ON a.SERVICE_PACKAGE_ID = b.SERVICE_PACKAGE_ID
                    JOIN CS_RAT_SERVICE_PLANS c
                        ON b.SERVICE_PLAN_ID = c.SERVICE_PLAN_ID
                    WHERE a.NETWORK_ID = ?
                    AND a.TARIFF_PLAN_TYPE = 'TP'
                    AND a.SERVICE_PACKAGE_ID = ?
                    """,
                    String.class,
                    networkId,
                    servicePackageId);

        tpServices.stream()
                .filter(ALLOWED_SERVICES::contains)
                .forEach(selectedSvcs_s2::add);
    }

    // DATP
    else if ("DATP".equalsIgnoreCase(planType)) {

        List<String> datpServices =
                jdbcTemplate.queryForList("""
                    SELECT DISTINCT
                        f.BALANCE_CATEGORY
                    FROM CS_RAT_TARIFF_SERVICE_PACK_MAP c
                    JOIN CS_ATP_ACCUMU_BON_DISC_MAP d
                        ON c.SERVICE_PACKAGE_ID = d.ATP_ID
                    JOIN CS_BNDL_MT_BNDL_BUCKET_MAP e
                        ON d.BUNDLE_OR_DISCOUNT_ID = e.BUNDLE_ID
                    JOIN BNDL_MT_BUCKETS f
                        ON e.BUCKET_ID = f.BUCKET_ID
                    WHERE c.NETWORK_ID = ?
                    AND c.TARIFF_PLAN_TYPE = 'DATP'
                    AND c.SERVICE_PACKAGE_ID = ?
                    """,
                    String.class,
                    networkId,
                    servicePackageId);

        datpServices.stream()
                .filter(ALLOWED_SERVICES::contains)
                .forEach(selectedSvcs_s3::add);
    }

    // AATP
    else if ("AATP".equalsIgnoreCase(planType)) {

        List<String> aatpServices =
                jdbcTemplate.queryForList("""
                    SELECT DISTINCT
                        f.BALANCE_CATEGORY
                    FROM CS_RAT_TARIFF_SERVICE_PACK_MAP c
                    JOIN CS_ATP_ACCUMU_BON_DISC_MAP d
                        ON c.SERVICE_PACKAGE_ID = d.ATP_ID
                    JOIN CS_BNDL_MT_BNDL_BUCKET_MAP e
                        ON d.BUNDLE_OR_DISCOUNT_ID = e.BUNDLE_ID
                    JOIN BNDL_MT_BUCKETS f
                        ON e.BUCKET_ID = f.BUCKET_ID
                    WHERE c.NETWORK_ID = ?
                    AND c.TARIFF_PLAN_TYPE = 'AATP'
                    AND c.SERVICE_PACKAGE_ID = ?
                    """,
                    String.class,
                    networkId,
                    servicePackageId);

        aatpServices.stream()
                .filter(ALLOWED_SERVICES::contains)
                .forEach(selectedSvcs_s4::add);
    }

    switch (planType.toUpperCase()) {

        case "TP" -> {

            data.putIfAbsent(
                    "tariffPlanId",
                    row.getServicePackageId());

            data.putIfAbsent(
                    "tariffPlanName",
                    row.getServicePackageDesc());
        }

        case "DATP" -> {

            if (row.getServicePackageId() != null
                    && seenDefaultAtpIds.add(
                            row.getServicePackageId())) {

                defaultAtps.add(buildAtpMap(row));
            }
        }

        case "AATP" -> {

            if (row.getServicePackageId() != null
                    && seenAllowedAtpIds.add(
                            row.getServicePackageId())) {

                allowedAtps.add(buildAtpMap(row));
            }
        }
    }
}

data.put("selectedSvcs_s2",
        new ArrayList<>(selectedSvcs_s2));

data.put("selectedSvcs_s3",
        new ArrayList<>(selectedSvcs_s3));

data.put("selectedSvcs_s4",
        new ArrayList<>(selectedSvcs_s4));

data.put("defaultAtps", defaultAtps);

data.put("allowedAtps", allowedAtps);

response.put("data", data);

return response;
    }

    private Map<String, Object> buildAtpMap(TariffPackageDetails row) {
        Map<String, Object> atp = new LinkedHashMap<>();
        atp.put("servicePackageId", row.getServicePackageId());
        atp.put("packageName", row.getServicePackageDesc());
        atp.put("validity", row.getRentalType());
        atp.put("rentalPeriod", row.getRentalPeriod());
        atp.put("midnightExpiry", "Y".equalsIgnoreCase(row.getPlanExpMidnightYn()) ? "Yes" : "No");
        atp.put("activationFee", row.getSpActivationFee() != null ? row.getSpActivationFee() : 0);
        atp.put("renewal", "Y".equalsIgnoreCase(row.getAutoRenewal()) ? "Yes" : "No");
        atp.put("rental", row.getRentalFee() != null ? row.getRentalFee() : 0);
        atp.put("maxCount", row.getMaxRenewalCount() != null ? row.getMaxRenewalCount() : 0);
        atp.put("freeCycles", String.valueOf(row.getRentalFreeCycles() != null ? row.getRentalFreeCycles() : 0));
        return atp;
    }
}
