package com.xius.TariffBuilder.Controller;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseBody;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.xius.TariffBuilder.Dto.LoginRequestDto;
import com.xius.TariffBuilder.Dto.TariffPackageDetailsDto;
import com.xius.TariffBuilder.Dto.UsrPrivilegeDTO;
import com.xius.TariffBuilder.Entity.ServicePlanPackMap;
import com.xius.TariffBuilder.UserService.BundleService;
import com.xius.TariffBuilder.UserService.SaveConfigService;
import com.xius.TariffBuilder.UserService.ServiceCloneService;
import com.xius.TariffBuilder.UserService.ServicePackageService;
import com.xius.TariffBuilder.UserService.ServicePlanService;
import com.xius.TariffBuilder.UserService.TariffApprovalService;
import com.xius.TariffBuilder.UserService.TariffPackageService;
import com.xius.TariffBuilder.UserService.TariffService;
import com.xius.TariffBuilder.UserService.UserLoginService;
import com.xius.TariffBuilder.util.JsonStorage;

import jakarta.servlet.http.HttpSession;

@Controller
public class BuilderController {

    private static final Logger logger = LoggerFactory.getLogger(BuilderController.class);

    @Autowired
    private ServicePlanService service;

    @Autowired
    private TariffService tariffService;

    @Autowired
    private SaveConfigService saveConfigService;

    @Autowired
    private UserLoginService userLoginService;

    @Autowired
    private ServiceCloneService serviceCloneService;

    @Autowired
    private ServicePackageService servicePackageService;

    @Autowired
    private BundleService bundleService;

    @Autowired
    private TariffApprovalService tariffApprovalService;

    @Autowired
    private JsonStorage jsonStorage;

    @Autowired
    private TariffPackageService tariffPackageService;

    // ================= LOGIN =================

    @GetMapping("/loginform")
    public String showLoginPage(HttpSession session, Model model) {

        model.addAttribute("sessionId", session.getId());

        if (!isNotLoggedIn(session)) {
            return "redirect:/builder";
        }

        model.addAttribute("loginForm", new LoginRequestDto());
        return "login";
    }

    @PostMapping("/login")
    public String login(@ModelAttribute("loginForm") LoginRequestDto request, HttpSession session, Model model) {

        logger.info("Login request received for user={}", request.getLoginId());

        if (request.getNetworkLoginName() == null || request.getNetworkLoginName().isBlank()) {

            logger.warn("Network name missing");

            model.addAttribute("message", "Please enter Network Name");

            return "login";
        }

        if (request.getLoginId() == null || request.getLoginId().isBlank()) {

            logger.warn("LoginId missing");

            model.addAttribute("message", "Please enter Username");

            return "login";
        }

        if (request.getPassword() == null || request.getPassword().isBlank()) {

            logger.warn("Password missing");

            model.addAttribute("message", "Please enter Password");

            return "login";
        }

        try {

            Map<String, Object> loginData = userLoginService.authenticate(request);

            List<UsrPrivilegeDTO> privileges = (List<UsrPrivilegeDTO>) loginData.get("privileges");

            List<String> privilegeIds = privileges.stream().map(UsrPrivilegeDTO::getPrivilegeId).distinct()
                    .collect(Collectors.toList());

            session.setAttribute("username", request.getLoginId());

            session.setAttribute("networkId", loginData.get("networkId"));

            session.setAttribute("privileges", privileges);

            session.setAttribute("privilegeIds", privilegeIds);

            logger.info("Login successful user={} networkId={} privilegesCount={}", request.getLoginId(),
                    loginData.get("networkId"), privileges.size());

            return "redirect:/builder";
        }

        catch (Exception ex) {

            logger.error("Login failed user={} error={}", request.getLoginId(), ex.getMessage(), ex);

            model.addAttribute("message", ex.getMessage());

            return "login";
        }
    }

    @GetMapping("/builder")
    public String builderHome(HttpSession session, Model model) {

        logger.info("Opening builder home");

        if (isNotLoggedIn(session)) {

            logger.warn("Unauthorized access to builder home");

            return "redirect:/loginform";
        }

        setCommonData(session, model);

        return "builder/step1";
    }

    // ================= ADMIN =================

    @GetMapping("/builder/admin")
    public String adminPage(HttpSession session, Model model) {

        logger.info("Opening admin page");

        if (isNotLoggedIn(session)) {

            logger.warn("Unauthorized admin page access");

            return "redirect:/loginform";
        }

        setCommonData(session, model);

        List<String> tariffList = tariffService.getTariffPackages();

        // log request info
        logger.info("Fetching TP list for admin user={} networkId={}",
                session.getAttribute("username"),
                session.getAttribute("networkId"));

        // log response data
        logger.info("TP list response size={}", tariffList.size());

        logger.debug("TP list data={}", tariffList);

        model.addAttribute("tariff", tariffList);

        return "builder/admin";
    }

    // ================= STEPS =================

    @GetMapping("/builder/step1")
    public String step1(HttpSession session, Model model) {

        logger.info("Opening step1");

        if (isNotLoggedIn(session)) {

            logger.warn("Unauthorized step1 access");

            return "redirect:/loginform";
        }

        setCommonData(session, model);

        return "builder/step1";
    }

    @GetMapping("/builder/step2")
    public String step2(HttpSession session, Model model) {

        logger.info("Opening step2");

        if (isNotLoggedIn(session)) {

            logger.warn("Unauthorized step2 access");

            return "redirect:/loginform";
        }

        setCommonData(session, model);

        return "builder/step2";
    }

    @GetMapping("/builder/step2/filter")
    @ResponseBody
    public List<ServicePlanPackMap> getTpPlans(@RequestParam String types, HttpSession session) {

        Long networkId = (Long) session.getAttribute("networkId");

        logger.info("Fetching TP plans networkId={} types={}", networkId, types);

        return service.getPlans(networkId, types);
    }

    @GetMapping("/builder/step3")
    public String step3(HttpSession session, Model model) {

        logger.info("Opening step3");

        if (isNotLoggedIn(session)) {

            logger.warn("Unauthorized step3 access");

            return "redirect:/loginform";
        }

        setCommonData(session, model);

        return "builder/step3";
    }

    @GetMapping("/builder/step3/filter")
    @ResponseBody
    public List<ServicePlanPackMap> getDAtpPlans(@RequestParam String types, HttpSession session) {

        Long networkId = (Long) session.getAttribute("networkId");

        logger.info("Fetching DATP plans networkId={} types={}", networkId, types);

        return service.getDAtpPlans(networkId, types);
    }

    @GetMapping("/builder/step4")
    public String step4(HttpSession session, Model model) {

        logger.info("Opening step4");

        if (isNotLoggedIn(session)) {

            logger.warn("Unauthorized step4 access");

            return "redirect:/loginform";
        }

        setCommonData(session, model);

        return "builder/step4";
    }

    @GetMapping("/builder/step4/filter")
    @ResponseBody
    public List<ServicePlanPackMap> getAAtpPlans(@RequestParam String types, HttpSession session) {

        Long networkId = (Long) session.getAttribute("networkId");

        logger.info("Fetching AATP plans networkId={} types={}", networkId, types);

        return service.getAAtpPlans(networkId, types);
    }

    @GetMapping("/builder/step5")
    public String step5(HttpSession session, Model model) {

        logger.info("Opening step5");

        if (isNotLoggedIn(session)) {

            logger.warn("Unauthorized step5 access");

            return "redirect:/loginform";
        }

        setCommonData(session, model);

        return "builder/step5";
    }

    // ================= HIERARCHY =================

    @GetMapping("/admin/hierarchy/{tpName}")
    @ResponseBody
    public Object getHierarchy(@PathVariable String tpName) {

        // logger.info("Fetching hierarchy for tpName={}", tpName);

        return tariffService.getHierarchy(tpName);
    }

    // ================= SAVE CONFIG =================

    @PostMapping("/prepareSaveConfig")
    public ResponseEntity<?> prepareSaveConfig(@RequestBody Map<String, Object> request, HttpSession session) {

        String username = (String) session.getAttribute("username");

        Long networkId = (Long) session.getAttribute("networkId");

        logger.info("Prepare config called username={} networkId={}", username, networkId);

        Map<String, Object> response = saveConfigService.prepareConfig(request, username, networkId);

        logger.info("Prepare config completed");

        return ResponseEntity.ok(response);
    }

    // ================= COMMON =================

    private void setCommonData(HttpSession session, Model model) {

        logger.debug("Setting common session attributes");

        model.addAttribute("username", session.getAttribute("username"));

        model.addAttribute("networkId", session.getAttribute("networkId"));

        model.addAttribute("privileges", session.getAttribute("privileges"));

        model.addAttribute("privilegeIds", session.getAttribute("privilegeIds"));

        model.addAttribute("sessionId", session.getId());
    }

    private boolean isNotLoggedIn(HttpSession session) {

        boolean result = session.getAttribute("username") == null;

        if (result) {

            logger.debug("User not logged in");

        }

        return result;
    }

    @GetMapping("/logout")
    public String logout(HttpSession session) {

        logger.info("User logout username={}", session.getAttribute("username"));

        session.invalidate();

        return "redirect:/loginform";
    }

    // ================= CLONE =================

    /*
     * POST /clone/validate
     * Validates tpName and publicityId before a modify-mode clone.
     */
    @ResponseBody
    @PostMapping("/clone/validate")
    public ResponseEntity<Map<String, Object>> validateClone(
            @RequestBody Map<String, Object> requestBody) {

        Long networkId = Long.valueOf(requestBody.get("networkId").toString());
        String tpName = requestBody.get("tpName").toString();
        String publicityId = requestBody.get("publicityId").toString();

        logger.info("Clone validate request networkId={} tpName={} publicityId={}", networkId, tpName, publicityId);

        Map<String, Object> result = tariffApprovalService.validateClone(networkId, tpName, publicityId);

        return ResponseEntity.ok(result);
    }

    /*
     * POST /clone
     * Supports cloneMode=direct (add _CLn suffix) and cloneMode=modify
     * (use overrideTpName / overridePublicityId supplied by the frontend).
     * Always returns HTTP 200 with { status: "success"|"error", ... }.
     */
    @ResponseBody
    @PostMapping("/clone")
    public ResponseEntity<Map<String, Object>> clone(@RequestBody Map<String, Object> requestBody) {

        String tpName = requestBody.get("tpName").toString();

        logger.info("Clone request received tpName={}", tpName);

        Map<String, Object> result = tariffApprovalService.clone(requestBody);

        logger.info("Clone completed tpName={} status={}", tpName, result.get("status"));

        return ResponseEntity.ok(result);
    }

    // ================= APPROVE / REJECT =================

    @ResponseBody
    @PostMapping("/approve/{tpName}")
    public ResponseEntity<Map<String, Object>> approve(
            @PathVariable String tpName) {

        Map<String, Object> result = tariffApprovalService.approve(tpName);
        return ResponseEntity.ok(result);
    }

    @ResponseBody
    @PostMapping("/reject/{tpName}")
    public ResponseEntity<Map<String, Object>> reject(
            @PathVariable String tpName) {

        Map<String, Object> result = tariffApprovalService.reject(tpName);
        return ResponseEntity.ok(result);
    }

    @GetMapping("/saved/list")
    @ResponseBody
    public Map<String, Object> getSavedList(HttpSession session) {

        String username = (String) session.getAttribute("username");

        return jsonStorage.getByUser(username);
    }

    @PostMapping("/saved/delete/{tpName}")
    @ResponseBody
    public ResponseEntity<?> deleteSaved(
            @PathVariable String tpName,
            HttpSession session) {

        String username = (String) session.getAttribute("username");

        if (username == null) {
            return ResponseEntity.status(401).body("Unauthorized");
        }

        jsonStorage.remove(tpName);

        return ResponseEntity.ok().build();
    }

    @PostMapping("/draft/save")
    @ResponseBody
    public ResponseEntity<?> saveDraft(
            @RequestBody(required = false) String draftJson,
            HttpSession session) {

        if (draftJson == null || draftJson.isBlank()) {
            return ResponseEntity.ok().build();
        }

        try {
            ObjectMapper mapper = new ObjectMapper();
            Map<String, Object> draft = mapper.readValue(draftJson, Map.class);

            // prefer session username, fall back to payload username, then guest
            String username = (String) session.getAttribute("username");
            if (username == null) {
                username = (String) draft.get("username");
            }
            if (username == null) {
                username = "guest";
            }

            saveConfigService.saveDraft(draft, username);

        } catch (Exception e) {
            e.printStackTrace();
        }

        return ResponseEntity.ok().build();
    }

    @GetMapping("/draft/list")
    @ResponseBody
    public List<Map<String, Object>> getDrafts(HttpSession session) {

        String username = (String) session.getAttribute("username");

        if (username == null) {
            username = "guest";
        }

        try {
            Path path = Paths.get("drafts", username + ".json");

            if (!Files.exists(path))
                return new ArrayList<>();

            return new ObjectMapper().readValue(
                    path.toFile(),
                    new TypeReference<List<Map<String, Object>>>() {
                    });

        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    @ResponseBody
    @PostMapping("/description")
    public Map<String, String> getDescription(@RequestBody Map<String, Object> request) {

        Long servicePackageId = Long.valueOf(request.get("servicePackageId").toString());

        Long networkId = Long.valueOf(request.get("networkId").toString());

        String desc = servicePackageService.getDescription(servicePackageId, networkId);

        // FIX → handle null
        if (desc == null) {
            desc = "Description not found";
        }
        return Map.of("description", desc);
    }

    @GetMapping("/tariff-package-details")
    public ResponseEntity<List<TariffPackageDetailsDto>> getTariffPackageDetails(
            @RequestParam Integer networkId) {

        List<TariffPackageDetailsDto> response = tariffPackageService.getTariffPackageDetails(networkId);

        return ResponseEntity.ok(response);
    }

    @GetMapping("/details")
    public ResponseEntity<?> getTariffPackageDetails(@RequestParam Long networkId, @RequestParam Long tariffPackageId) {

        return ResponseEntity.ok(tariffApprovalService.getTariffPackageDetails(tariffPackageId, networkId));
    }
}