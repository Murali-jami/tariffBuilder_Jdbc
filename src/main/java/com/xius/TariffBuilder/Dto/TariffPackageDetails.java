package com.xius.TariffBuilder.Dto;

import lombok.Data;

import java.util.Date;

@Data
public class TariffPackageDetails {

    /*
     * CS_RAT_TARIFF_PACKAGE
     */
    private Long tariffPackageId;
    private String tariffPackageDesc;
    private String publicityId;
    private String chargeId;
    private String discountOnRentalYn;
    private String packageType;
    private String isCorporateYn;
    private String tariffPackCategory;
    private Date endDate;
    private Long networkId;

    /*
     * CS_RAT_TARIFF_SERVICE_PACK_MAP
     */
    private Long servicePackageId;
    private String tariffPlanType;

    /*
     * CS_RAT_SERVICE_PACKAGE
     */
    private String servicePackageDesc;
    private String spChargeId;
    private Double spActivationFee;

    /*
     * CS_RAT_SERVICE_PLAN_PACKAGE
     */
    private Long servicePlanId;

    /*
     * SERVICE TYPES
     */
    private String serviceTypes;

    /*
     * CS_RAT_PERIODIC_CHARGE_INFO
     */
    private String chargeDesc;
    private String rentalType;
    private Integer rentalPeriod;
    private Double activationFee;
    private Double rentalFee;
    private Integer rentalFreeCycles;
    private String autoRenewal;
    private String planExpMidnightYn;
    private Integer maxRenewalCount;
    private String createdBy;
    private Integer priority;
}