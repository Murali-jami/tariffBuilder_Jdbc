package com.xius.TariffBuilder.UserService;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.xius.TariffBuilder.Dto.TariffPackageDetailsDto;

@Service
public class TariffPackageService {

	@Autowired
	@Qualifier("oracleJdbcTemplate")
	private JdbcTemplate jdbcTemplate;

	public List<TariffPackageDetailsDto> getTariffPackageDetails(Integer networkId) {

		String tariffSql = """
				SELECT
				    a.tariff_package_id,
				    a.tariff_package_desc,
				    MIN(c.charge_id) AS charge_id,
				    MIN((SELECT g.activation_fee
				         FROM cs_rat_periodic_charge_info g
				         WHERE g.charge_id = c.charge_id)) AS activation_fee,
				    MIN(DECODE((SELECT g.rental_type
				                FROM cs_rat_periodic_charge_info g
				                WHERE g.charge_id = c.charge_id),
				        'M', 'Monthly', 'O', 'Others', 'D', 'Daily',
				        'W', 'Weekly',  'F', 'Fixed',  'U', 'Unlimited',
				        'Y', 'Yearly')) AS rental_type,
				    MAX((SELECT g.rental_period
				         FROM cs_rat_periodic_charge_info g
				         WHERE g.charge_id = c.charge_id)) AS rental_period,

				    MAX(CASE WHEN f.balance_category = 'DATA' THEN
				        CASE WHEN f.total_bucket > 99999 THEN 'UNLIMITED'
				             ELSE fn_data_unit_converter(f.total_bucket)
				        END
				    END) AS data_benefit,

				    MAX(CASE WHEN f.balance_category = 'SMS' THEN
				        CASE WHEN f.total_bucket > 99999 THEN 'UNLIMITED'
				             ELSE f.total_bucket || ' SMS'
				        END
				    END) AS sms_benefit,

				    MAX(CASE WHEN f.balance_category = 'VOICE' THEN
				        CASE WHEN f.total_bucket > 99999 THEN 'UNLIMITED'
				             ELSE f.total_bucket || ' Sec'
				        END
				    END) AS voice_benefit

				FROM cs_rat_tariff_package a
				JOIN cs_rat_tariff_service_pack_map c ON a.tariff_package_id = c.tariff_package_id
				JOIN cs_atp_accumu_bon_disc_map     d ON c.service_package_id = d.atp_id
				JOIN cs_bndl_mt_bndl_bucket_map     e ON d.bundle_or_discount_id = e.bundle_id
				JOIN (
				    SELECT
				        e2.bundle_id,
				        f2.balance_category,
				        SUM(f2.bucket_unit_value) AS total_bucket
				    FROM cs_bndl_mt_bndl_bucket_map e2
				    JOIN bndl_mt_buckets f2 ON e2.bucket_id = f2.bucket_id
				    GROUP BY e2.bundle_id, f2.balance_category
				) f ON e.bundle_id = f.bundle_id

				WHERE a.network_id = ?

				GROUP BY
				    a.tariff_package_id,
				    a.tariff_package_desc

				ORDER BY
				    a.tariff_package_id
				""";

		String rateGroupSql = """
				SELECT UNIQUE
				    f.tariff_package_id,
				    f.tariff_package_desc,
				    a.rate_group_name

				FROM cs_rate_group_data a,
				     cs_dre_rating_group_details b,
				     cs_rat_service_data_zone_map c,
				     cs_rat_service_plan_package d,
				     cs_rat_tariff_service_pack_map e,
				     cs_rat_tariff_package f

				WHERE a.rate_group_id = b.rating_group_id
				AND b.zone_group_id = c.data_zone_id
				AND c.service_plan_id = d.service_plan_id
				AND d.service_package_id = e.service_package_id
				AND e.tariff_package_id = f.tariff_package_id
				AND e.network_id = ?
				""";

		// Main Query Result
		List<TariffPackageDetailsDto> tariffList = jdbcTemplate.query(
				tariffSql,
				(rs, rowNum) -> {

					TariffPackageDetailsDto dto = new TariffPackageDetailsDto();

					dto.setTariff_package_id(
							rs.getLong("tariff_package_id"));

					dto.setTariffPackageDesc(
							rs.getString("tariff_package_desc"));

					dto.setActivationFee(
							rs.getDouble("activation_fee"));

					dto.setRentalType(
							rs.getString("rental_type"));

					dto.setRentalPeriod(
							rs.getLong("rental_period"));

					dto.setDataBenefit(
							rs.getString("data_benefit"));

					dto.setSmsBenefit(
							rs.getString("sms_benefit"));

					dto.setVoiceBenefit(
							rs.getString("voice_benefit"));

					dto.setRateGroupNames(
							new ArrayList<>());

					return dto;

				},
				networkId);

		// Rate Group Query Result
		List<Map<String, Object>> rateGroupList = jdbcTemplate.queryForList(
				rateGroupSql,
				networkId);

		// Group Rate Groups by Tariff Package ID
		Map<Long, List<String>> rateGroupMap = new HashMap<>();

		for (Map<String, Object> row : rateGroupList) {

			Long tariffPackageId = ((Number) row.get("TARIFF_PACKAGE_ID"))
					.longValue();

			String rateGroupName = (String) row.get("RATE_GROUP_NAME");

			rateGroupMap
					.computeIfAbsent(
							tariffPackageId,
							k -> new ArrayList<>())
					.add(rateGroupName);
		}

		// Map Rate Groups to Main Response
		for (TariffPackageDetailsDto dto : tariffList) {

			dto.setRateGroupNames(
					rateGroupMap.getOrDefault(
							dto.getTariff_package_id(),
							new ArrayList<>()));
		}

		return tariffList;
	}
}