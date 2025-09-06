#!/usr/bin/env python3
"""
Health Monitoring Service for Dual Network Barcode Management System
Monitors health endpoints across both networks and all backend instances
Windows Server 2019 Deployment
"""

import asyncio
import aiohttp
import logging
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from pathlib import Path
import os
import sys

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('C:/barcode-app/monitoring/health_monitor.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class HealthCheckResult:
    """Health check result data structure"""
    instance_id: str
    network: str
    endpoint: str
    status: str
    response_time: float
    timestamp: datetime
    error_message: Optional[str] = None
    health_score: float = 0.0

@dataclass
class InstanceStatus:
    """Instance status tracking"""
    instance_id: str
    network: str
    port: int
    is_healthy: bool
    last_check: datetime
    consecutive_failures: int
    health_score: float
    endpoints_status: Dict[str, bool]

class HealthMonitor:
    """Health monitoring service for dual network deployment"""
    
    def __init__(self):
        self.networks = {
            "network1": {
                "ip": "192.168.0.106",
                "instances": [
                    {"id": "instance_1", "port": 5000},
                    {"id": "instance_2", "port": 5001},
                    {"id": "instance_3", "port": 5002}
                ]
            },
            "network2": {
                "ip": "192.168.0.249",
                "instances": [
                    {"id": "instance_1", "port": 5000},
                    {"id": "instance_2", "port": 5001},
                    {"id": "instance_3", "port": 5002}
                ]
            }
        }
        
        self.health_endpoints = [
            "/health/",
            "/health/database",
            "/health/pool",
            "/health/full"
        ]
        
        self.instance_status: Dict[str, InstanceStatus] = {}
        self.health_history: List[HealthCheckResult] = []
        self.check_interval = 30  # seconds
        self.timeout = 10  # seconds
        self.max_consecutive_failures = 3
        
        # Initialize instance status tracking
        self._initialize_instance_status()
        
        # Create monitoring directory
        self.monitoring_dir = Path("C:/barcode-app/monitoring")
        self.monitoring_dir.mkdir(parents=True, exist_ok=True)
    
    def _initialize_instance_status(self):
        """Initialize instance status tracking"""
        for network_name, network_config in self.networks.items():
            for instance in network_config["instances"]:
                instance_id = f"{network_name}_{instance['id']}"
                self.instance_status[instance_id] = InstanceStatus(
                    instance_id=instance_id,
                    network=network_name,
                    port=instance["port"],
                    is_healthy=True,
                    last_check=datetime.now(),
                    consecutive_failures=0,
                    health_score=100.0,
                    endpoints_status={endpoint: True for endpoint in self.health_endpoints}
                )
    
    async def check_instance_health(self, network_name: str, instance: Dict[str, int], 
                                  session: aiohttp.ClientSession) -> List[HealthCheckResult]:
        """Check health of a single instance across all endpoints"""
        results = []
        network_ip = self.networks[network_name]["ip"]
        instance_id = f"{network_name}_{instance['id']}"
        
        for endpoint in self.health_endpoints:
            url = f"http://{network_ip}:{instance['port']}{endpoint}"
            start_time = time.time()
            
            try:
                async with session.get(url, timeout=aiohttp.ClientTimeout(total=self.timeout)) as response:
                    response_time = (time.time() - start_time) * 1000  # Convert to milliseconds
                    
                    if response.status == 200:
                        status = "healthy"
                        error_message = None
                        health_score = max(0, 100 - (response_time / 10))  # Penalize slow responses
                    else:
                        status = "unhealthy"
                        error_message = f"HTTP {response.status}"
                        health_score = 0.0
                    
                    result = HealthCheckResult(
                        instance_id=instance_id,
                        network=network_name,
                        endpoint=endpoint,
                        status=status,
                        response_time=response_time,
                        timestamp=datetime.now(),
                        error_message=error_message,
                        health_score=health_score
                    )
                    results.append(result)
                    
            except asyncio.TimeoutError:
                response_time = self.timeout * 1000
                result = HealthCheckResult(
                    instance_id=instance_id,
                    network=network_name,
                    endpoint=endpoint,
                    status="timeout",
                    response_time=response_time,
                    timestamp=datetime.now(),
                    error_message="Request timeout",
                    health_score=0.0
                )
                results.append(result)
                
            except Exception as e:
                response_time = (time.time() - start_time) * 1000
                result = HealthCheckResult(
                    instance_id=instance_id,
                    network=network_name,
                    endpoint=endpoint,
                    status="error",
                    response_time=response_time,
                    timestamp=datetime.now(),
                    error_message=str(e),
                    health_score=0.0
                )
                results.append(result)
        
        return results
    
    async def check_network_health(self, network_name: str) -> List[HealthCheckResult]:
        """Check health of all instances in a network"""
        network_config = self.networks[network_name]
        all_results = []
        
        async with aiohttp.ClientSession() as session:
            tasks = []
            for instance in network_config["instances"]:
                task = self.check_instance_health(network_name, instance, session)
                tasks.append(task)
            
            # Run all health checks in parallel
            results_list = await asyncio.gather(*tasks, return_exceptions=True)
            
            for results in results_list:
                if isinstance(results, Exception):
                    logger.error(f"Error checking network {network_name}: {results}")
                else:
                    all_results.extend(results)
        
        return all_results
    
    def update_instance_status(self, results: List[HealthCheckResult]):
        """Update instance status based on health check results"""
        for result in results:
            instance_id = result.instance_id
            
            if instance_id not in self.instance_status:
                continue
            
            instance_status = self.instance_status[instance_id]
            
            # Update endpoint status
            instance_status.endpoints_status[result.endpoint] = result.status == "healthy"
            
            # Calculate overall health score
            endpoint_scores = [result.health_score for result in results 
                             if result.instance_id == instance_id]
            if endpoint_scores:
                instance_status.health_score = sum(endpoint_scores) / len(endpoint_scores)
            
            # Update consecutive failures
            if result.status in ["unhealthy", "timeout", "error"]:
                instance_status.consecutive_failures += 1
            else:
                instance_status.consecutive_failures = 0
            
            # Update overall health status
            instance_status.is_healthy = (
                instance_status.consecutive_failures < self.max_consecutive_failures and
                instance_status.health_score > 50.0
            )
            
            instance_status.last_check = result.timestamp
    
    def get_unhealthy_instances(self) -> List[InstanceStatus]:
        """Get list of unhealthy instances"""
        return [status for status in self.instance_status.values() if not status.is_healthy]
    
    def get_network_health_summary(self) -> Dict[str, Dict]:
        """Get health summary for each network"""
        summary = {}
        
        for network_name in self.networks.keys():
            network_instances = [status for status in self.instance_status.values() 
                               if status.network == network_name]
            
            healthy_count = sum(1 for instance in network_instances if instance.is_healthy)
            total_count = len(network_instances)
            avg_health_score = sum(instance.health_score for instance in network_instances) / total_count
            
            summary[network_name] = {
                "healthy_instances": healthy_count,
                "total_instances": total_count,
                "health_percentage": (healthy_count / total_count) * 100,
                "average_health_score": avg_health_score,
                "network_status": "healthy" if healthy_count == total_count else "degraded" if healthy_count > 0 else "down"
            }
        
        return summary
    
    async def save_health_report(self, results: List[HealthCheckResult]):
        """Save health check results to file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = self.monitoring_dir / f"health_report_{timestamp}.json"
        
        report_data = {
            "timestamp": datetime.now().isoformat(),
            "network_summary": self.get_network_health_summary(),
            "instance_status": {k: asdict(v) for k, v in self.instance_status.items()},
            "health_checks": [asdict(result) for result in results]
        }
        
        with open(report_file, 'w') as f:
            json.dump(report_data, f, indent=2, default=str)
        
        # Keep only last 100 reports
        report_files = sorted(self.monitoring_dir.glob("health_report_*.json"))
        if len(report_files) > 100:
            for old_file in report_files[:-100]:
                old_file.unlink()
    
    async def run_health_check_cycle(self):
        """Run a complete health check cycle for all networks"""
        logger.info("Starting health check cycle...")
        
        all_results = []
        
        # Check both networks in parallel
        tasks = []
        for network_name in self.networks.keys():
            task = self.check_network_health(network_name)
            tasks.append(task)
        
        results_list = await asyncio.gather(*tasks, return_exceptions=True)
        
        for results in results_list:
            if isinstance(results, Exception):
                logger.error(f"Error in health check cycle: {results}")
            else:
                all_results.extend(results)
        
        # Update instance status
        self.update_instance_status(all_results)
        
        # Log results
        unhealthy_instances = self.get_unhealthy_instances()
        if unhealthy_instances:
            logger.warning(f"Found {len(unhealthy_instances)} unhealthy instances:")
            for instance in unhealthy_instances:
                logger.warning(f"  - {instance.instance_id}: {instance.consecutive_failures} consecutive failures, health score: {instance.health_score:.1f}")
        else:
            logger.info("All instances are healthy")
        
        # Save health report
        await self.save_health_report(all_results)
        
        # Add to history
        self.health_history.extend(all_results)
        
        # Keep only last 1000 health checks
        if len(self.health_history) > 1000:
            self.health_history = self.health_history[-1000:]
        
        return all_results
    
    async def start_monitoring(self):
        """Start continuous health monitoring"""
        logger.info("Starting health monitoring service...")
        logger.info(f"Monitoring {len(self.networks)} networks with {sum(len(net['instances']) for net in self.networks.values())} total instances")
        logger.info(f"Check interval: {self.check_interval} seconds")
        
        while True:
            try:
                await self.run_health_check_cycle()
                await asyncio.sleep(self.check_interval)
            except KeyboardInterrupt:
                logger.info("Health monitoring stopped by user")
                break
            except Exception as e:
                logger.error(f"Error in health monitoring cycle: {e}")
                await asyncio.sleep(self.check_interval)

def main():
    """Main entry point"""
    monitor = HealthMonitor()
    
    try:
        asyncio.run(monitor.start_monitoring())
    except KeyboardInterrupt:
        logger.info("Health monitoring service stopped")
    except Exception as e:
        logger.error(f"Fatal error in health monitoring: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

