package com.xius.TariffBuilder.Dto;

import java.util.List;

import lombok.Data;

@Data
public class TariffPackageDetailsDto {

	private Long tariff_package_id;

	private String tariffPackageDesc;

	private Double activationFee;

	private String rentalType;

	private Long rentalPeriod;

	private String dataBenefit;

	private String smsBenefit;

	private String voiceBenefit;

	private List<String> rateGroupNames;
}