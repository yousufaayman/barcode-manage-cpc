#!/usr/bin/env python3
"""
Auto-Recovery Service for Dual Network Barcode Management System
Automatically restarts failed instances and performs cross-instance health verification
Windows Server 2019 Deployment
"""

import asyncio
import aiohttp
import logging
import json
import time
import subprocess
import psutil
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from pathlib import Path
import os
import sys
import win32serviceutil
import win32service
import win32event

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('C:/barcode-app/monitoring/auto_recovery.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class RecoveryAction:
    """Recovery action data structure"""
    action_id: str
    instance_id: str
    action_type: str  # restart, health_check, cross_verify
    timestamp: datetime
    success: bool
    error_message: Optional[str] = None
    recovery_time: float = 0.0

@dataclass
class InstanceRecoveryStatus:
    """Instance recovery status tracking"""
    instance_id: str
    service_name: str
    network: str
    port: int
    restart_count: int
    last_restart: Optional[datetime]
    last_health_check: datetime
    is_recovering: bool
    recovery_cooldown_until: Optional[datetime]

class AutoRecoveryService:
    """Auto-recovery service for dual network deployment"""
    
    def __init__(self):
        self.networks = {
            "network1": {
                "ip": "192.168.0.106",
                "instances": [
                    {"id": "instance_1", "port": 5000, "service": "BarcodeBackend_Service_1"},
                    {"id": "instance_2", "port": 5001, "service": "BarcodeBackend_Service_2"},
                    {"id": "instance_3", "port": 5002, "service": "BarcodeBackend_Service_3"}
                ]
            },
            "network2": {
                "ip": "192.168.0.249",
                "instances": [
                    {"id": "instance_1", "port": 5000, "service": "BarcodeBackend_Service_1"},
                    {"id": "instance_2", "port": 5001, "service": "BarcodeBackend_Service_2"},
                    {"id": "instance_3", "port": 5002, "service": "BarcodeBackend_Service_3"}
                ]
            }
        }
        
        self.health_endpoints = [
            "/health/",
            "/health/database",
            "/health/pool",
            "/health/full"
        ]
        
        self.recovery_status: Dict[str, InstanceRecoveryStatus] = {}
        self.recovery_history: List[RecoveryAction] = []
        self.check_interval = 60  # seconds
        self.health_check_timeout = 10  # seconds
        self.restart_cooldown = 300  # 5 minutes
        self.max_restart_attempts = 5
        self.cross_verification_delay = 30  # seconds after restart
        
        # Initialize recovery status tracking
        self._initialize_recovery_status()
        
        # Create monitoring directory
        self.monitoring_dir = Path("C:/barcode-app/monitoring")
        self.monitoring_dir.mkdir(parents=True, exist_ok=True)
    
    def _initialize_recovery_status(self):
        """Initialize recovery status tracking"""
        for network_name, network_config in self.networks.items():
            for instance in network_config["instances"]:
                instance_id = f"{network_name}_{instance['id']}"
                self.recovery_status[instance_id] = InstanceRecoveryStatus(
                    instance_id=instance_id,
                    service_name=instance["service"],
                    network=network_name,
                    port=instance["port"],
                    restart_count=0,
                    last_restart=None,
                    last_health_check=datetime.now(),
                    is_recovering=False,
                    recovery_cooldown_until=None
                )
    
    async def check_instance_health(self, network_name: str, instance: Dict, 
                                  session: aiohttp.ClientSession) -> Tuple[bool, float, str]:
        """Check health of a single instance"""
        network_ip = self.networks[network_name]["ip"]
        url = f"http://{network_ip}:{instance['port']}/health/"
        start_time = time.time()
        
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=self.health_check_timeout)) as response:
                response_time = (time.time() - start_time) * 1000
                
                if response.status == 200:
                    return True, response_time, "healthy"
                else:
                    return False, response_time, f"HTTP {response.status}"
                    
        except asyncio.TimeoutError:
            response_time = self.health_check_timeout * 1000
            return False, response_time, "timeout"
            
        except Exception as e:
            response_time = (time.time() - start_time) * 1000
            return False, response_time, str(e)
    
    def is_service_running(self, service_name: str) -> bool:
        """Check if a Windows service is running"""
        try:
            status = win32serviceutil.QueryServiceStatus(service_name)[1]
            return status == win32service.SERVICE_RUNNING
        except Exception as e:
            logger.error(f"Error checking service {service_name}: {e}")
            return False
    
    def restart_service(self, service_name: str) -> Tuple[bool, str]:
        """Restart a Windows service"""
        try:
            logger.info(f"Stopping service: {service_name}")
            win32serviceutil.StopService(service_name)
            
            # Wait for service to stop
            max_wait = 30
            wait_time = 0
            while self.is_service_running(service_name) and wait_time < max_wait:
                time.sleep(1)
                wait_time += 1
            
            if self.is_service_running(service_name):
                return False, "Service failed to stop within timeout"
            
            logger.info(f"Starting service: {service_name}")
            win32serviceutil.StartService(service_name)
            
            # Wait for service to start
            max_wait = 60
            wait_time = 0
            while not self.is_service_running(service_name) and wait_time < max_wait:
                time.sleep(1)
                wait_time += 1
            
            if not self.is_service_running(service_name):
                return False, "Service failed to start within timeout"
            
            return True, "Service restarted successfully"
            
        except Exception as e:
            return False, f"Error restarting service: {e}"
    
    async def perform_cross_verification(self, network_name: str, restarted_instance: Dict) -> List[RecoveryAction]:
        """Perform cross-verification of other instances after restarting one"""
        logger.info(f"Performing cross-verification for network {network_name}")
        actions = []
        
        # Wait for the restarted instance to stabilize
        await asyncio.sleep(self.cross_verification_delay)
        
        async with aiohttp.ClientSession() as session:
            # Check all instances in the network
            for instance in self.networks[network_name]["instances"]:
                instance_id = f"{network_name}_{instance['id']}"
                
                # Skip the instance we just restarted
                if instance_id == f"{network_name}_{restarted_instance['id']}":
                    continue
                
                action_id = f"cross_verify_{instance_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
                start_time = time.time()
                
                try:
                    is_healthy, response_time, status_message = await self.check_instance_health(
                        network_name, instance, session
                    )
                    
                    recovery_time = time.time() - start_time
                    
                    if not is_healthy:
                        logger.warning(f"Cross-verification found unhealthy instance: {instance_id}")
                        
                        # Check if this instance needs restart
                        recovery_status = self.recovery_status[instance_id]
                        
                        if (not recovery_status.is_recovering and 
                            (recovery_status.recovery_cooldown_until is None or 
                             datetime.now() > recovery_status.recovery_cooldown_until)):
                            
                            logger.info(f"Restarting unhealthy instance found during cross-verification: {instance_id}")
                            success, error_message = self.restart_service(instance["service"])
                            
                            if success:
                                recovery_status.restart_count += 1
                                recovery_status.last_restart = datetime.now()
                                recovery_status.recovery_cooldown_until = datetime.now() + timedelta(seconds=self.restart_cooldown)
                                
                                action = RecoveryAction(
                                    action_id=action_id,
                                    instance_id=instance_id,
                                    action_type="cross_verify_restart",
                                    timestamp=datetime.now(),
                                    success=True,
                                    recovery_time=recovery_time
                                )
                            else:
                                action = RecoveryAction(
                                    action_id=action_id,
                                    instance_id=instance_id,
                                    action_type="cross_verify_restart",
                                    timestamp=datetime.now(),
                                    success=False,
                                    error_message=error_message,
                                    recovery_time=recovery_time
                                )
                            
                            actions.append(action)
                        else:
                            logger.info(f"Instance {instance_id} is in cooldown or already recovering")
                    else:
                        logger.info(f"Cross-verification: {instance_id} is healthy")
                        
                except Exception as e:
                    recovery_time = time.time() - start_time
                    action = RecoveryAction(
                        action_id=action_id,
                        instance_id=instance_id,
                        action_type="cross_verify",
                        timestamp=datetime.now(),
                        success=False,
                        error_message=str(e),
                        recovery_time=recovery_time
                    )
                    actions.append(action)
        
        return actions
    
    async def recover_instance(self, instance_id: str, network_name: str, instance: Dict) -> RecoveryAction:
        """Recover a single instance"""
        recovery_status = self.recovery_status[instance_id]
        
        if recovery_status.is_recovering:
            logger.info(f"Instance {instance_id} is already being recovered")
            return RecoveryAction(
                action_id=f"recovery_skip_{instance_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                instance_id=instance_id,
                action_type="skip",
                timestamp=datetime.now(),
                success=False,
                error_message="Instance already being recovered"
            )
        
        if (recovery_status.recovery_cooldown_until and 
            datetime.now() < recovery_status.recovery_cooldown_until):
            logger.info(f"Instance {instance_id} is in cooldown period")
            return RecoveryAction(
                action_id=f"recovery_cooldown_{instance_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                instance_id=instance_id,
                action_type="cooldown",
                timestamp=datetime.now(),
                success=False,
                error_message="Instance in cooldown period"
            )
        
        if recovery_status.restart_count >= self.max_restart_attempts:
            logger.error(f"Instance {instance_id} has exceeded maximum restart attempts")
            return RecoveryAction(
                action_id=f"recovery_max_attempts_{instance_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                instance_id=instance_id,
                action_type="max_attempts",
                timestamp=datetime.now(),
                success=False,
                error_message="Maximum restart attempts exceeded"
            )
        
        action_id = f"recovery_{instance_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        start_time = time.time()
        
        try:
            recovery_status.is_recovering = True
            
            logger.info(f"Starting recovery for instance: {instance_id}")
            
            # Restart the service
            success, error_message = self.restart_service(instance["service"])
            recovery_time = time.time() - start_time
            
            if success:
                recovery_status.restart_count += 1
                recovery_status.last_restart = datetime.now()
                recovery_status.recovery_cooldown_until = datetime.now() + timedelta(seconds=self.restart_cooldown)
                
                logger.info(f"Successfully restarted instance: {instance_id}")
                
                # Perform cross-verification
                cross_verify_actions = await self.perform_cross_verification(network_name, instance)
                self.recovery_history.extend(cross_verify_actions)
                
                action = RecoveryAction(
                    action_id=action_id,
                    instance_id=instance_id,
                    action_type="restart",
                    timestamp=datetime.now(),
                    success=True,
                    recovery_time=recovery_time
                )
            else:
                action = RecoveryAction(
                    action_id=action_id,
                    instance_id=instance_id,
                    action_type="restart",
                    timestamp=datetime.now(),
                    success=False,
                    error_message=error_message,
                    recovery_time=recovery_time
                )
            
        except Exception as e:
            recovery_time = time.time() - start_time
            action = RecoveryAction(
                action_id=action_id,
                instance_id=instance_id,
                action_type="restart",
                timestamp=datetime.now(),
                success=False,
                error_message=str(e),
                recovery_time=recovery_time
            )
        finally:
            recovery_status.is_recovering = False
        
        return action
    
    async def check_and_recover_instances(self):
        """Check all instances and recover unhealthy ones"""
        logger.info("Starting instance health check and recovery cycle...")
        
        recovery_actions = []
        
        async with aiohttp.ClientSession() as session:
            for network_name, network_config in self.networks.items():
                logger.info(f"Checking network: {network_name}")
                
                for instance in network_config["instances"]:
                    instance_id = f"{network_name}_{instance['id']}"
                    recovery_status = self.recovery_status[instance_id]
                    
                    # Check if service is running
                    if not self.is_service_running(instance["service"]):
                        logger.warning(f"Service {instance['service']} is not running for instance {instance_id}")
                        
                        # Try to start the service
                        success, error_message = self.restart_service(instance["service"])
                        
                        action = RecoveryAction(
                            action_id=f"service_start_{instance_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                            instance_id=instance_id,
                            action_type="service_start",
                            timestamp=datetime.now(),
                            success=success,
                            error_message=error_message if not success else None
                        )
                        recovery_actions.append(action)
                        continue
                    
                    # Check health endpoint
                    is_healthy, response_time, status_message = await self.check_instance_health(
                        network_name, instance, session
                    )
                    
                    recovery_status.last_health_check = datetime.now()
                    
                    if not is_healthy:
                        logger.warning(f"Instance {instance_id} is unhealthy: {status_message}")
                        
                        # Attempt recovery
                        action = await self.recover_instance(instance_id, network_name, instance)
                        recovery_actions.append(action)
                    else:
                        logger.debug(f"Instance {instance_id} is healthy (response time: {response_time:.2f}ms)")
        
        # Add actions to history
        self.recovery_history.extend(recovery_actions)
        
        # Keep only last 1000 recovery actions
        if len(self.recovery_history) > 1000:
            self.recovery_history = self.recovery_history[-1000:]
        
        # Log summary
        successful_recoveries = [action for action in recovery_actions if action.success]
        failed_recoveries = [action for action in recovery_actions if not action.success]
        
        if successful_recoveries:
            logger.info(f"Successfully recovered {len(successful_recoveries)} instances")
        if failed_recoveries:
            logger.warning(f"Failed to recover {len(failed_recoveries)} instances")
        
        return recovery_actions
    
    async def save_recovery_report(self, actions: List[RecoveryAction]):
        """Save recovery actions to file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = self.monitoring_dir / f"recovery_report_{timestamp}.json"
        
        report_data = {
            "timestamp": datetime.now().isoformat(),
            "recovery_status": {k: asdict(v) for k, v in self.recovery_status.items()},
            "recovery_actions": [asdict(action) for action in actions],
            "summary": {
                "total_actions": len(actions),
                "successful_actions": len([a for a in actions if a.success]),
                "failed_actions": len([a for a in actions if not a.success])
            }
        }
        
        with open(report_file, 'w') as f:
            json.dump(report_data, f, indent=2, default=str)
        
        # Keep only last 50 reports
        report_files = sorted(self.monitoring_dir.glob("recovery_report_*.json"))
        if len(report_files) > 50:
            for old_file in report_files[:-50]:
                old_file.unlink()
    
    async def start_recovery_service(self):
        """Start continuous auto-recovery service"""
        logger.info("Starting auto-recovery service...")
        logger.info(f"Monitoring {len(self.networks)} networks with {sum(len(net['instances']) for net in self.networks.values())} total instances")
        logger.info(f"Check interval: {self.check_interval} seconds")
        logger.info(f"Restart cooldown: {self.restart_cooldown} seconds")
        logger.info(f"Max restart attempts: {self.max_restart_attempts}")
        
        while True:
            try:
                actions = await self.check_and_recover_instances()
                await self.save_recovery_report(actions)
                await asyncio.sleep(self.check_interval)
            except KeyboardInterrupt:
                logger.info("Auto-recovery service stopped by user")
                break
            except Exception as e:
                logger.error(f"Error in auto-recovery cycle: {e}")
                await asyncio.sleep(self.check_interval)

def main():
    """Main entry point"""
    recovery_service = AutoRecoveryService()
    
    try:
        asyncio.run(recovery_service.start_recovery_service())
    except KeyboardInterrupt:
        logger.info("Auto-recovery service stopped")
    except Exception as e:
        logger.error(f"Fatal error in auto-recovery service: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()

