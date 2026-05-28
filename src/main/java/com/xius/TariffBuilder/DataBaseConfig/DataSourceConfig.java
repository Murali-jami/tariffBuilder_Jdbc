package com.xius.TariffBuilder.DataBaseConfig;
 
import javax.sql.DataSource;
 
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
 
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
 
@Configuration
public class DataSourceConfig {
 
    // ORACLE
    @Primary
    @Bean(name="oracleDataSource")
    @ConfigurationProperties(prefix="spring.datasource")
    public DataSource oracleDataSource(){
 
        return DataSourceBuilder.create().build();
    }
 
    @Primary
    @Bean(name="oracleJdbcTemplate")
    public JdbcTemplate oracleJdbcTemplate(
            @Qualifier("oracleDataSource") DataSource ds){
 
        return new JdbcTemplate(ds);
    }

    @Primary
    @Bean(name="transactionManager")
    public PlatformTransactionManager transactionManager(
            @Qualifier("oracleDataSource") DataSource ds) {
        return new DataSourceTransactionManager(ds);
    }
 
 
    // POSTGRES (LOGIN)
    @Bean(name="pgDataSource")
    @ConfigurationProperties(prefix="postgredb.datasource")
    public DataSource pgDataSource(){
 
        return DataSourceBuilder.create().build();
    }
 
    @Bean(name="pgJdbcTemplate")
    public JdbcTemplate pgJdbcTemplate(
            @Qualifier("pgDataSource") DataSource ds){
 
        return new JdbcTemplate(ds);
    }
}