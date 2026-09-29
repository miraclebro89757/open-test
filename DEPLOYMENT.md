# Deployment Guide

## Production Deployment Checklist

### Environment Variables

Before deploying to production, update these variables:

```bash
# Strong database password
POSTGRES_PASSWORD=<strong-random-password>

# Production-grade Redis (consider Redis Cloud)
REDIS_URL=redis://<production-redis>:6379

# Neo4j production credentials
NEO4J_PASSWORD=<strong-neo4j-password>

# Your OpenAI API key
OPENAI_API_KEY=<your-production-key>

# Production API URL
REACT_APP_API_URL=https://api.yourdomain.com
REACT_APP_WS_URL=wss://api.yourdomain.com
```

### Security Considerations

1. **API Gateway**
   - Add authentication middleware
   - Enable HTTPS/TLS
   - Rate limiting
   - CORS configuration for specific domains

2. **Database**
   - Enable SSL connections
   - Regular backups
   - Connection pooling
   - Read replicas for scaling

3. **Redis**
   - Enable password authentication
   - Use Redis Sentinel for HA
   - Enable encryption in transit

4. **Secrets Management**
   - Never commit .env to git
   - Use secret managers (AWS Secrets Manager, HashiCorp Vault)
   - Rotate API keys regularly

### Scaling Considerations

#### Horizontal Scaling

```yaml
# docker-compose.prod.yml example
services:
  api:
    deploy:
      replicas: 3
      
  agent:
    deploy:
      replicas: 2
      
  executor:
    deploy:
      replicas: 3
```

#### Resource Limits

```yaml
services:
  api:
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

### Monitoring

1. **Logging**
   - Centralized logging (ELK, Datadog)
   - Structured JSON logs
   - Log levels: ERROR, WARN, INFO, DEBUG

2. **Metrics**
   - Prometheus + Grafana
   - Key metrics:
     - Request latency
     - Error rates
     - Test execution times
     - Database connection pool

3. **Alerts**
   - Service health checks
   - Database connection failures
   - High error rates
   - Disk space

### Cloud Deployment

#### AWS Example

```bash
# Use ECS/EKS for containers
# RDS for PostgreSQL
# ElastiCache for Redis
# OpenSearch for Elasticsearch
# DocumentDB for Neo4j (or self-managed)
```

#### GCP Example

```bash
# Cloud Run for containers
# Cloud SQL for PostgreSQL
# Memorystore for Redis
# Cloud Search
```

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml example
name: Deploy
on:
  push:
    branches: [main]
    
jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build images
        run: docker compose build
      - name: Push to registry
        run: |
          docker tag open-test-api registry/api:latest
          docker push registry/api:latest
      - name: Deploy
        run: kubectl apply -f k8s/
```

### Database Migrations

For production, use migration tools:

```bash
# Install golang-migrate
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Create migration
migrate create -ext sql -dir db/migrations -seq add_users_table

# Run migrations
migrate -path db/migrations -database "postgres://..." up
```

### Backup Strategy

1. **Database Backups**
   - Daily automated backups
   - Point-in-time recovery enabled
   - Test restore procedures monthly

2. **Configuration Backups**
   - Version control all configs
   - Document all manual changes

### Health Checks

Implement comprehensive health checks:

```go
// API health check
GET /health
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "version": "1.0.0"
}
```

### Performance Optimization

1. **Database**
   - Index optimization
   - Query optimization
   - Connection pooling
   - Read replicas

2. **Caching**
   - Redis for frequently accessed data
   - CDN for static assets
   - Browser caching headers

3. **API**
   - Response compression
   - Request batching
   - Rate limiting

### Disaster Recovery

1. **Backup Procedures**
   - Automated daily backups
   - Off-site backup storage
   - Regular restore tests

2. **Failover Plan**
   - Multi-AZ deployment
   - Database replication
   - Load balancer health checks

3. **Incident Response**
   - Runbook for common issues
   - On-call rotation
   - Post-mortem process

## Development vs Production

| Component | Development | Production |
|-----------|------------|------------|
| Database | Single PostgreSQL | Multi-AZ RDS |
| Redis | Single instance | Redis Cluster |
| API | 1 replica | 3+ replicas |
| Monitoring | Docker logs | Centralized logging |
| Secrets | .env file | Secret manager |
| HTTPS | HTTP | HTTPS + TLS 1.3 |
| Auth | None | JWT + OAuth2 |

## Cost Optimization

1. **Right-size instances**
   - Start small, scale up as needed
   - Use spot/preemptible instances for non-critical workloads

2. **Database optimization**
   - Archive old test results
   - Delete old executions after N days
   - Use cheaper storage tiers for archives

3. **Caching**
   - Reduce database queries
   - Cache API responses
   - CDN for static content

## Compliance

- **GDPR**: Implement data retention policies
- **SOC 2**: Enable audit logging
- **HIPAA**: Encrypt data at rest and in transit (if applicable)

## Support

For production issues:
1. Check health endpoints
2. Review logs in monitoring system
3. Check resource utilization
4. Review recent deployments
