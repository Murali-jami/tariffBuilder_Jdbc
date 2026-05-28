package com.xius.TariffBuilder.exception;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger logger = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(TariffInsertException.class)
    public ResponseEntity<Map<String, Object>> handleTariffInsert(TariffInsertException ex) {
        logger.error("TariffInsertException step={} table={} msg={}", ex.getStep(), ex.getFailedTable(), ex.getMessage(), ex);
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "error");
        body.put("message", "Error inserting into " + ex.getFailedTable() + " at " + ex.getStep() + ": "
                + (ex.getCause() != null ? ex.getCause().getMessage() : ex.getMessage()));
        body.put("failedStep", ex.getStep());
        body.put("failedTable", ex.getFailedTable());
        return ResponseEntity.ok(body);
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, Object>> handleMissingParam(MissingServletRequestParameterException ex) {
        return error("Missing required parameter: " + ex.getParameterName());
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, Object>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return error("Invalid value " + ex.getValue() + " for parameter " + ex.getName());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, Object>> handleUnreadable(HttpMessageNotReadableException ex) {
        return error("Invalid or malformed request body");
    }

    @ExceptionHandler(NullPointerException.class)
    public ResponseEntity<Map<String, Object>> handleNpe(NullPointerException ex) {
        logger.error("NullPointerException", ex);
        return error("A required field is missing or null");
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Map<String, Object>> handleRuntime(RuntimeException ex) {
        logger.error("RuntimeException", ex);
        return error(ex.getMessage());
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleAll(Exception ex) {
        logger.error("Unexpected exception", ex);
        return error("An unexpected error occurred: " + ex.getMessage());
    }

    private ResponseEntity<Map<String, Object>> error(String msg) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", "error");
        body.put("message", msg);
        return ResponseEntity.ok(body);
    }
}
