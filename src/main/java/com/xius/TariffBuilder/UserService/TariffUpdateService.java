package com.xius.TariffBuilder.UserService;


import java.sql.Date;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.BeanPropertyRowMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

import com.xius.TariffBuilder.Dto.TariffPackageDetails;

@Service
public class TariffUpdateService{

	private static final Logger logger = LoggerFactory.getLogger(TariffUpdateService.class);
	private static final DateTimeFormatter formatter = DateTimeFormatter.ofPattern("MM/dd/yyyy");

	@Autowired
	@Qualifier("oracleJdbcTemplate")
	private JdbcTemplate jdbcTemplate;

	@Autowired
	private PlatformTransactionManager transactionManager;

	// =====================================================
	// GET TARIFF PACKAGE DETAILS
	// =====================================================
	public Map<String, Object> getTariffPackageDetails(Long tariffPackageId, Long networkId) {

		logger.info("GetTariffPackageDetails request received tariffPackageId={} networkId={}",
				tariffPackageId, networkId);

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
				        WHEN 'TP'   THEN 1
				        WHEN 'DATP' THEN 2
				        WHEN 'AATP' THEN 3
				        ELSE 4
				    END
				""";

		List<TariffPackageDetails> list = jdbcTemplate.query(sql,
				new BeanPropertyRowMapper<>(TariffPackageDetails.class),
				tariffPackageId, networkId);

		if (list == null || list.isEmpty()) {
			logger.warn("No records found tariffPackageId={} networkId={}", tariffPackageId, networkId);
			return Collections.emptyMap();
		}

		TariffPackageDetails first = list.get(0);
		Map<String, Object> response = new LinkedHashMap<>();
		response.put("tpName", first.getTariffPackageDesc());
		response.put("username", first.getCreatedBy() != null ? first.getCreatedBy() : "");
		response.put("networkId", first.getNetworkId());

		Map<String, Object> data = new LinkedHashMap<>();
		data.put("username", first.getCreatedBy() != null ? first.getCreatedBy() : "");
		data.put("isUpdate", true);
		data.put("submittedOn",
				LocalDate.now().format(DateTimeFormatter.ofPattern("dd MMM yyyy")));
		data.put("packageType", first.getPackageType());
		data.put("tariffPackCategory", first.getTariffPackCategory());
		data.put("tariffPackageDesc", first.getTariffPackageDesc());

		Double minAtpCharge = list.stream()
				.filter(r -> r.getTariffPlanType() != null
						&& (r.getTariffPlanType().equalsIgnoreCase("DATP")
								|| r.getTariffPlanType().equalsIgnoreCase("AATP")))
				.map(TariffPackageDetails::getActivationFee)
				.filter(fee -> fee != null)
				.min(Double::compareTo)
				.orElse(null);
		data.put("charge", minAtpCharge != null ? String.valueOf(minAtpCharge) : "");

		data.put("endDate",
				first.getEndDate() != null
						? LocalDate.parse(first.getEndDate().toString().substring(0, 10))
								.format(DateTimeFormatter.ofPattern("MM/dd/yyyy"))
						: "");
		data.put("publicityId", first.getPublicityId());
		data.put("discountOnRentalYn", "Y".equalsIgnoreCase(first.getDiscountOnRentalYn()));
		data.put("isCorporateYn", "Y".equalsIgnoreCase(first.getIsCorporateYn()));

		List<Map<String, Object>> defaultAtps = new ArrayList<>();
		List<Map<String, Object>> allowedAtps  = new ArrayList<>();

		Set<Long> seenDefaultAtpIds  = new LinkedHashSet<>();
		Set<Long> seenAllowedAtpIds  = new LinkedHashSet<>();
		Set<String> selectedSvcs_s2  = new LinkedHashSet<>();
		Set<String> selectedSvcs_s3  = new LinkedHashSet<>();
		Set<String> selectedSvcs_s4  = new LinkedHashSet<>();

		Set<String> ALLOWED_SERVICES = Set.of("VOICE", "SMS", "DATA");

		for (TariffPackageDetails row : list) {

			String planType = row.getTariffPlanType();
			if (planType == null) continue;

			Long servicePackageId = row.getServicePackageId();

			// ── Service type lookups ─────────────────────────────────────
			if ("TP".equalsIgnoreCase(planType)) {

				List<String> tpServices = jdbcTemplate.queryForList("""
						SELECT DISTINCT
						    DECODE(c.TYPE_OF_SERVICE, 1,'VOICE', 2,'SMS', 3,'DATA')
						FROM CS_RAT_TARIFF_SERVICE_PACK_MAP a
						JOIN CS_RAT_SERVICE_PLAN_PACKAGE b
						    ON a.SERVICE_PACKAGE_ID = b.SERVICE_PACKAGE_ID
						JOIN CS_RAT_SERVICE_PLANS c
						    ON b.SERVICE_PLAN_ID = c.SERVICE_PLAN_ID
						WHERE a.NETWORK_ID = ?
						  AND a.TARIFF_PLAN_TYPE = 'TP'
						  AND a.SERVICE_PACKAGE_ID = ?
						""", String.class, networkId, servicePackageId);

				tpServices.stream().filter(ALLOWED_SERVICES::contains).forEach(selectedSvcs_s2::add);

			} else if ("DATP".equalsIgnoreCase(planType)) {

				List<String> datpServices = jdbcTemplate.queryForList("""
						SELECT DISTINCT f.BALANCE_CATEGORY
						FROM CS_RAT_TARIFF_SERVICE_PACK_MAP c
						JOIN CS_ATP_ACCUMU_BON_DISC_MAP d ON c.SERVICE_PACKAGE_ID = d.ATP_ID
						JOIN CS_BNDL_MT_BNDL_BUCKET_MAP e ON d.BUNDLE_OR_DISCOUNT_ID = e.BUNDLE_ID
						JOIN BNDL_MT_BUCKETS f             ON e.BUCKET_ID = f.BUCKET_ID
						WHERE c.NETWORK_ID = ?
						  AND c.TARIFF_PLAN_TYPE = 'DATP'
						  AND c.SERVICE_PACKAGE_ID = ?
						""", String.class, networkId, servicePackageId);

				datpServices.stream().filter(ALLOWED_SERVICES::contains).forEach(selectedSvcs_s3::add);

			} else if ("AATP".equalsIgnoreCase(planType)) {

				List<String> aatpServices = jdbcTemplate.queryForList("""
						SELECT DISTINCT f.BALANCE_CATEGORY
						FROM CS_RAT_TARIFF_SERVICE_PACK_MAP c
						JOIN CS_ATP_ACCUMU_BON_DISC_MAP d ON c.SERVICE_PACKAGE_ID = d.ATP_ID
						JOIN CS_BNDL_MT_BNDL_BUCKET_MAP e ON d.BUNDLE_OR_DISCOUNT_ID = e.BUNDLE_ID
						JOIN BNDL_MT_BUCKETS f             ON e.BUCKET_ID = f.BUCKET_ID
						WHERE c.NETWORK_ID = ?
						  AND c.TARIFF_PLAN_TYPE = 'AATP'
						  AND c.SERVICE_PACKAGE_ID = ?
						""", String.class, networkId, servicePackageId);

				aatpServices.stream().filter(ALLOWED_SERVICES::contains).forEach(selectedSvcs_s4::add);
			}

			// ── Build ATP / TP data maps ──────────────────────────────────
			switch (planType.toUpperCase()) {

			case "TP" -> {
				data.putIfAbsent("tariffPlanId",   row.getServicePackageId());
				data.putIfAbsent("tariffPlanName", row.getServicePackageDesc());
			}

			case "DATP" -> {
				if (row.getServicePackageId() != null
						&& seenDefaultAtpIds.add(row.getServicePackageId())) {
					defaultAtps.add(buildAtpMap(row));
				}
			}

			case "AATP" -> {
				if (row.getServicePackageId() != null
						&& seenAllowedAtpIds.add(row.getServicePackageId())) {
					allowedAtps.add(buildAtpMap(row));
				}
			}
			}
		}

		data.put("selectedSvcs_s2", new ArrayList<>(selectedSvcs_s2));
		data.put("selectedSvcs_s3", new ArrayList<>(selectedSvcs_s3));
		data.put("selectedSvcs_s4", new ArrayList<>(selectedSvcs_s4));
		data.put("defaultAtps",     defaultAtps);
		data.put("allowedAtps",     allowedAtps);

		response.put("data", data);

		logger.info("GetTariffPackageDetails completed tariffPackageId={} defaultAtps={} allowedAtps={}",
				tariffPackageId, defaultAtps.size(), allowedAtps.size());

		return response;
	}

	// =====================================================
	// UPDATE TARIFF PACKAGE
	// =====================================================
	public Map<String, Object> updateTariffPackage(Long tariffPackageId, Long networkId,
			Map<String, Object> requestBody) {

		logger.info("Update request received tariffPackageId={} networkId={}", tariffPackageId, networkId);

		@SuppressWarnings("unchecked")
		Map<String, Object> data = (Map<String, Object>) requestBody.get("data");
		if (data == null) {
			Map<String, Object> err = new LinkedHashMap<>();
			err.put("status", "error");
			err.put("message", "Request body must contain a 'data' object");
			return err;
		}

		DefaultTransactionDefinition def = new DefaultTransactionDefinition();
		def.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);
		TransactionStatus status = transactionManager.getTransaction(def);

		try {
			// ── UPDATE CS_RAT_TARIFF_PACKAGE ─────────────────────────────
			int tpRows = jdbcTemplate.update("""
					UPDATE CS_RAT_TARIFF_PACKAGE SET
					    TARIFF_PACKAGE_DESC  = ?,
					    PUBLICITY_ID         = ?,
					    PACKAGE_TYPE         = ?,
					    IS_CORPORATE_YN      = ?,
					    TARIFF_PACK_CATEGORY = ?,
					    END_DATE             = ?
					WHERE TARIFF_PACKAGE_ID = ?
					  AND NETWORK_ID = ?
					""",
					data.get("tariffPackageDesc"),
					data.get("publicityId"),
					data.get("packageType"),
					convertYN(data.get("isCorporateYn")),
					data.get("tariffPackCategory"),
					Date.valueOf(LocalDate.parse(data.get("endDate").toString(), formatter)),
					tariffPackageId,
					networkId);

			logger.info("CS_RAT_TARIFF_PACKAGE updated rowsAffected={} tariffPackageId={}",
					tpRows, tariffPackageId);

			// ── UPDATE CS_RAT_TPID_VS_PUBLICITYID ────────────────────────
			int pubRows = jdbcTemplate.update("""
					UPDATE CS_RAT_TPID_VS_PUBLICITYID SET
					    TARIFF_PACKAGE_DESC = ?,
					    PUBLICITY_ID        = ?
					WHERE TARIFF_PACKAGE_ID = ?
					  AND NETWORK_ID = ?
					""",
					data.get("tariffPackageDesc"),
					data.get("publicityId"),
					tariffPackageId,
					networkId);

			logger.info("CS_RAT_TPID_VS_PUBLICITYID updated rowsAffected={} tariffPackageId={}",
					pubRows, tariffPackageId);

			// ── UPDATE CS_RAT_PERIODIC_CHARGE_INFO per ATP ───────────────
			@SuppressWarnings("unchecked")
			List<Map<String, Object>> defaultAtps =
					(List<Map<String, Object>>) data.getOrDefault("defaultAtps", List.of());

			@SuppressWarnings("unchecked")
			List<Map<String, Object>> allowedAtps =
					(List<Map<String, Object>>) data.getOrDefault("allowedAtps", List.of());

			List<Map<String, Object>> allAtps = new ArrayList<>();
			allAtps.addAll(defaultAtps);
			allAtps.addAll(allowedAtps);

			for (Map<String, Object> atp : allAtps) {

				Object chargeIdObj = atp.get("chargeId");
				if (chargeIdObj == null) {
					logger.warn("Skipping ATP update — chargeId is null servicePackageId={}",
							atp.get("servicePackageId"));
					continue;
				}
				String chargeId = chargeIdObj.toString();

				Object validityDaysRaw = atp.get("rentalPeriod");
				Object rentalPeriod;
				if ("O".equals(atp.get("validity")) && validityDaysRaw != null
						&& !validityDaysRaw.toString().trim().isEmpty()) {
					try {
						rentalPeriod = Integer.parseInt(validityDaysRaw.toString().trim());
					} catch (NumberFormatException e) {
						rentalPeriod = 1;
					}
				} else {
					rentalPeriod = 1;
				}

				int pciRows = jdbcTemplate.update("""
						UPDATE CS_RAT_PERIODIC_CHARGE_INFO SET
						    RENTAL_TYPE          = ?,
						    RENTAL_PERIOD        = ?,
						    ACTIVATION_FEE       = ?,
						    RENTAL_FEE           = ?,
						    RENTAL_FREE_CYCLES   = ?,
						    AUTO_RENEWAL         = ?,
						    PLAN_EXP_MIDNIGHT_YN = ?,
						    MAX_RENEWAL_COUNT    = ?
						WHERE CHARGE_ID  = ?
						  AND NETWORK_ID = ?
						""",
						atp.get("validity"),
						rentalPeriod,
						data.get("charge"),
						atp.get("rental"),
						atp.get("freeCycles"),
						convertYN(atp.get("renewal")),
						convertYN(atp.get("midnightExpiry")),
						atp.get("maxCount"),
						chargeId,
						networkId);

				logger.info("CS_RAT_PERIODIC_CHARGE_INFO updated chargeId={} rowsAffected={}",
						chargeId, pciRows);
			}

			transactionManager.commit(status);

			Map<String, Object> result = new LinkedHashMap<>();
			result.put("status", "success");
			result.put("message", "Tariff package updated successfully");
			result.put("tariffPackageId", tariffPackageId);
			logger.info("Tariff package update committed tariffPackageId={}", tariffPackageId);
			return result;

		} catch (Exception ex) {
			transactionManager.rollback(status);
			logger.error("Update failed tariffPackageId={} networkId={} error={}",
					tariffPackageId, networkId, ex.getMessage(), ex);
			Map<String, Object> err = new LinkedHashMap<>();
			err.put("status", "error");
			err.put("message", ex.getMessage() != null ? ex.getMessage() : "Unexpected error during update");
			return err;
		}
	}

	// =====================================================
	// HELPERS
	// =====================================================
	private Map<String, Object> buildAtpMap(TariffPackageDetails row) {
		Map<String, Object> atp = new LinkedHashMap<>();
		atp.put("servicePackageId", row.getServicePackageId());
		atp.put("packageName",      row.getServicePackageDesc());
		atp.put("chargeId",         row.getSpChargeId());          // needed for update
		atp.put("validity",         row.getRentalType());
		atp.put("rentalPeriod",     row.getRentalPeriod());
		atp.put("midnightExpiry",   "Y".equalsIgnoreCase(row.getPlanExpMidnightYn()) ? "Yes" : "No");
		atp.put("activationFee",    row.getActivationFee()     != null ? row.getActivationFee()     : 0);
		atp.put("renewal",          "Y".equalsIgnoreCase(row.getAutoRenewal())        ? "Yes" : "No");
		atp.put("rental",           row.getRentalFee()         != null ? row.getRentalFee()         : 0);
		atp.put("maxCount",         row.getMaxRenewalCount()   != null ? row.getMaxRenewalCount()   : 0);
		atp.put("freeCycles",       String.valueOf(row.getRentalFreeCycles() != null
				                                     ? row.getRentalFreeCycles() : 0));
		return atp;
	}

	private String convertYN(Object value) {
		if (value == null) return "N";
		String v = value.toString();
		if (v.equalsIgnoreCase("Y") || v.equalsIgnoreCase("YES") || v.equalsIgnoreCase("TRUE"))
			return "Y";
		return "N";
	}
}
