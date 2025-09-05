#!/usr/bin/env python3
"""
Alerting Service for Dual Network Barcode Management System
Sends alerts for critical failures, service issues, and system events
Windows Server 2019 Deployment
"""

import asyncio
import aiohttp
import logging
import json
import smtplib
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict
from pathlib import Path
import os
import sys
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('C:/barcode-app/monitoring/alerting.log'),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

@dataclass
class Alert:
    """Alert data structure"""
    alert_id: str
    alert_type: str  # critical, warning, info
    severity: str    # high, medium, low
    title: str
    message: str
    source: str      # service name or component
    network: str
    instance_id: Optional[str] = None
    timestamp: datetime = None
    resolved: bool = False
    resolution_time: Optional[datetime] = None
    metadata: Dict = None

@dataclass
class AlertRule:
    """Alert rule configuration"""
    rule_id: str
    name: str
    condition: str
    severity: str
    alert_type: str
    enabled: bool = True
    cooldown_minutes: int = 15
    max_alerts_per_hour: int = 10

class AlertingService:
    """Alerting service for dual network deployment"""
    
    def __init__(self):
        self.alert_history: List[Alert] = []
        self.active_alerts: Dict[str, Alert] = {}
        self.alert_rules: List[AlertRule] = []
        self.alert_cooldowns: Dict[str, datetime] = {}
        self.alert_counts: Dict[str, int] = {}
        
        # Alert configuration
        self.check_interval = 30  # seconds
        self.alert_retention_days = 30
        
        # Notification channels
        self.email_config = {
            "enabled": False,
            "smtp_server": "",
            "smtp_port": 587,
            "username": "",
            "password": "",
            "from_email": "",
            "to_emails": []
        }
        
        self.webhook_config = {
            "enabled": False,
            "url": "",
            "headers": {}
        }
        
        self.slack_config = {
            "enabled": False,
            "webhook_url": "",
            "channel": "#alerts"
        }
        
        # Initialize alert rules
        self._initialize_alert_rules()
        
        # Create monitoring directory
        self.monitoring_dir = Path("C:/barcode-app/monitoring")
        self.monitoring_dir.mkdir(parents=True, exist_ok=True)
        
        # Load configuration
        self._load_configuration()
    
    def _initialize_alert_rules(self):
        """Initialize default alert rules"""
        self.alert_rules = [
            AlertRule(
                rule_id="service_down",
                name="Service Down",
                condition="service_status == 'stopped'",
                severity="high",
                alert_type="critical",
                cooldown_minutes=5
            ),
            AlertRule(
                rule_id="health_check_failed",
                name="Health Check Failed",
                condition="health_score < 50",
                severity="medium",
                alert_type="warning",
                cooldown_minutes=10
            ),
            AlertRule(
                rule_id="high_response_time",
                name="High Response Time",
                condition="response_time > 5000",
                severity="medium",
                alert_type="warning",
                cooldown_minutes=15
            ),
            AlertRule(
                rule_id="database_connection_failed",
                name="Database Connection Failed",
                condition="database_status == 'failed'",
                severity="high",
                alert_type="critical",
                cooldown_minutes=5
            ),
            AlertRule(
                rule_id="network_unreachable",
                name="Network Unreachable",
                condition="network_status == 'down'",
                severity="high",
                alert_type="critical",
                cooldown_minutes=2
            ),
            AlertRule(
                rule_id="auto_recovery_triggered",
                name="Auto Recovery Triggered",
                condition="recovery_action == 'restart'",
                severity="medium",
                alert_type="info",
                cooldown_minutes=30
            ),
            AlertRule(
                rule_id="disk_space_low",
                name="Disk Space Low",
                condition="disk_usage > 90",
                severity="medium",
                alert_type="warning",
                cooldown_minutes=60
            ),
            AlertRule(
                rule_id="memory_usage_high",
                name="Memory Usage High",
                condition="memory_usage > 85",
                severity="medium",
                alert_type="warning",
                cooldown_minutes=30
            )
        ]
    
    def _load_configuration(self):
        """Load alerting configuration from file"""
        config_path = self.monitoring_dir / "alerting_config.json"
        
        if config_path.exists():
            try:
                with open(config_path, 'r') as f:
                    config = json.load(f)
                
                self.email_config.update(config.get("email", {}))
                self.webhook_config.update(config.get("webhook", {}))
                self.slack_config.update(config.get("slack", {}))
                
                logger.info("Alerting configuration loaded successfully")
            except Exception as e:
                logger.error(f"Error loading alerting configuration: {e}")
        else:
            # Create default configuration
            self._save_configuration()
    
    def _save_configuration(self):
        """Save alerting configuration to file"""
        config_path = self.monitoring_dir / "alerting_config.json"
        
        config = {
            "email": self.email_config,
            "webhook": self.webhook_config,
            "slack": self.slack_config,
            "last_updated": datetime.now().isoformat()
        }
        
        try:
            with open(config_path, 'w') as f:
                json.dump(config, f, indent=2, default=str)
            logger.info("Alerting configuration saved")
        except Exception as e:
            logger.error(f"Error saving alerting configuration: {e}")
    
    def create_alert(self, alert_type: str, severity: str, title: str, message: str, 
                    source: str, network: str, instance_id: str = None, metadata: Dict = None) -> Alert:
        """Create a new alert"""
        alert_id = f"{alert_type}_{source}_{network}_{int(time.time())}"
        
        alert = Alert(
            alert_id=alert_id,
            alert_type=alert_type,
            severity=severity,
            title=title,
            message=message,
            source=source,
            network=network,
            instance_id=instance_id,
            timestamp=datetime.now(),
            metadata=metadata or {}
        )
        
        return alert
    
    def should_send_alert(self, alert: Alert) -> bool:
        """Check if alert should be sent based on rules and cooldowns"""
        # Check cooldown
        cooldown_key = f"{alert.source}_{alert.network}_{alert.alert_type}"
        if cooldown_key in self.alert_cooldowns:
            cooldown_until = self.alert_cooldowns[cooldown_key]
            if datetime.now() < cooldown_until:
                logger.debug(f"Alert {alert.alert_id} in cooldown until {cooldown_until}")
                return False
        
        # Check rate limiting
        hour_key = f"{alert.source}_{datetime.now().strftime('%Y-%m-%d-%H')}"
        if hour_key in self.alert_counts:
            if self.alert_counts[hour_key] >= 10:  # Max 10 alerts per hour per source
                logger.debug(f"Alert {alert.alert_id} rate limited for {alert.source}")
                return False
        
        return True
    
    def update_alert_cooldown(self, alert: Alert):
        """Update alert cooldown based on severity"""
        cooldown_key = f"{alert.source}_{alert.network}_{alert.alert_type}"
        
        # Set cooldown based on severity
        cooldown_minutes = {
            "high": 5,
            "medium": 15,
            "low": 60
        }.get(alert.severity, 15)
        
        self.alert_cooldowns[cooldown_key] = datetime.now() + timedelta(minutes=cooldown_minutes)
        
        # Update rate limiting
        hour_key = f"{alert.source}_{datetime.now().strftime('%Y-%m-%d-%H')}"
        self.alert_counts[hour_key] = self.alert_counts.get(hour_key, 0) + 1
    
    async def send_email_alert(self, alert: Alert):
        """Send email alert"""
        if not self.email_config["enabled"]:
            return
        
        try:
            msg = MIMEMultipart()
            msg['From'] = self.email_config["from_email"]
            msg['To'] = ", ".join(self.email_config["to_emails"])
            msg['Subject'] = f"[{alert.severity.upper()}] {alert.title}"
            
            # Create email body
            body = f"""
Alert Details:
- Type: {alert.alert_type}
- Severity: {alert.severity}
- Source: {alert.source}
- Network: {alert.network}
- Instance: {alert.instance_id or 'N/A'}
- Time: {alert.timestamp.strftime('%Y-%m-%d %H:%M:%S')}

Message:
{alert.message}

Metadata:
{json.dumps(alert.metadata, indent=2) if alert.metadata else 'None'}

---
Barcode Management System - Dual Network Deployment
Generated at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
"""
            
            msg.attach(MIMEText(body, 'plain'))
            
            # Send email
            server = smtplib.SMTP(self.email_config["smtp_server"], self.email_config["smtp_port"])
            server.starttls()
            server.login(self.email_config["username"], self.email_config["password"])
            text = msg.as_string()
            server.sendmail(self.email_config["from_email"], self.email_config["to_emails"], text)
            server.quit()
            
            logger.info(f"Email alert sent for {alert.alert_id}")
            
        except Exception as e:
            logger.error(f"Failed to send email alert: {e}")
    
    async def send_webhook_alert(self, alert: Alert):
        """Send webhook alert"""
        if not self.webhook_config["enabled"]:
            return
        
        try:
            payload = {
                "alert_id": alert.alert_id,
                "alert_type": alert.alert_type,
                "severity": alert.severity,
                "title": alert.title,
                "message": alert.message,
                "source": alert.source,
                "network": alert.network,
                "instance_id": alert.instance_id,
                "timestamp": alert.timestamp.isoformat(),
                "metadata": alert.metadata
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.webhook_config["url"],
                    json=payload,
                    headers=self.webhook_config["headers"],
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        logger.info(f"Webhook alert sent for {alert.alert_id}")
                    else:
                        logger.error(f"Webhook alert failed with status {response.status}")
                        
        except Exception as e:
            logger.error(f"Failed to send webhook alert: {e}")
    
    async def send_slack_alert(self, alert: Alert):
        """Send Slack alert"""
        if not self.slack_config["enabled"]:
            return
        
        try:
            # Determine color based on severity
            color = {
                "high": "danger",
                "medium": "warning", 
                "low": "good"
            }.get(alert.severity, "warning")
            
            payload = {
                "channel": self.slack_config["channel"],
                "username": "Barcode Management System",
                "icon_emoji": ":warning:",
                "attachments": [
                    {
                        "color": color,
                        "title": alert.title,
                        "text": alert.message,
                        "fields": [
                            {
                                "title": "Type",
                                "value": alert.alert_type,
                                "short": True
                            },
                            {
                                "title": "Severity",
                                "value": alert.severity,
                                "short": True
                            },
                            {
                                "title": "Source",
                                "value": alert.source,
                                "short": True
                            },
                            {
                                "title": "Network",
                                "value": alert.network,
                                "short": True
                            },
                            {
                                "title": "Instance",
                                "value": alert.instance_id or "N/A",
                                "short": True
                            },
                            {
                                "title": "Time",
                                "value": alert.timestamp.strftime('%Y-%m-%d %H:%M:%S'),
                                "short": True
                            }
                        ],
                        "footer": "Barcode Management System",
                        "ts": int(alert.timestamp.timestamp())
                    }
                ]
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    self.slack_config["webhook_url"],
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    if response.status == 200:
                        logger.info(f"Slack alert sent for {alert.alert_id}")
                    else:
                        logger.error(f"Slack alert failed with status {response.status}")
                        
        except Exception as e:
            logger.error(f"Failed to send Slack alert: {e}")
    
    async def send_alert(self, alert: Alert):
        """Send alert through all configured channels"""
        if not self.should_send_alert(alert):
            return
        
        logger.info(f"Sending alert: {alert.alert_id} - {alert.title}")
        
        # Send through all channels
        tasks = []
        if self.email_config["enabled"]:
            tasks.append(self.send_email_alert(alert))
        if self.webhook_config["enabled"]:
            tasks.append(self.send_webhook_alert(alert))
        if self.slack_config["enabled"]:
            tasks.append(self.send_slack_alert(alert))
        
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        
        # Update cooldown and rate limiting
        self.update_alert_cooldown(alert)
        
        # Add to history
        self.alert_history.append(alert)
        self.active_alerts[alert.alert_id] = alert
        
        # Keep only last 1000 alerts
        if len(self.alert_history) > 1000:
            self.alert_history = self.alert_history[-1000:]
    
    def resolve_alert(self, alert_id: str, resolution_message: str = "Alert resolved"):
        """Mark an alert as resolved"""
        if alert_id in self.active_alerts:
            alert = self.active_alerts[alert_id]
            alert.resolved = True
            alert.resolution_time = datetime.now()
            alert.message += f"\n\nResolution: {resolution_message}"
            
            logger.info(f"Alert {alert_id} resolved: {resolution_message}")
            
            # Remove from active alerts
            del self.active_alerts[alert_id]
    
    async def process_health_data(self, health_data: Dict):
        """Process health monitoring data and generate alerts"""
        for network_name, network_data in health_data.items():
            for instance_id, instance_data in network_data.get("instances", {}).items():
                # Check for service down
                if not instance_data.get("is_healthy", True):
                    alert = self.create_alert(
                        alert_type="critical",
                        severity="high",
                        title=f"Service Down - {instance_id}",
                        message=f"Service {instance_id} is not responding to health checks",
                        source="health_monitor",
                        network=network_name,
                        instance_id=instance_id,
                        metadata=instance_data
                    )
                    await self.send_alert(alert)
                
                # Check for low health score
                health_score = instance_data.get("health_score", 100)
                if health_score < 50:
                    alert = self.create_alert(
                        alert_type="warning",
                        severity="medium",
                        title=f"Low Health Score - {instance_id}",
                        message=f"Health score for {instance_id} is {health_score:.1f}%",
                        source="health_monitor",
                        network=network_name,
                        instance_id=instance_id,
                        metadata=instance_data
                    )
                    await self.send_alert(alert)
                
                # Check for high response time
                response_time = instance_data.get("response_time", 0)
                if response_time > 5000:  # 5 seconds
                    alert = self.create_alert(
                        alert_type="warning",
                        severity="medium",
                        title=f"High Response Time - {instance_id}",
                        message=f"Response time for {instance_id} is {response_time:.0f}ms",
                        source="health_monitor",
                        network=network_name,
                        instance_id=instance_id,
                        metadata=instance_data
                    )
                    await self.send_alert(alert)
    
    async def process_recovery_data(self, recovery_data: Dict):
        """Process auto-recovery data and generate alerts"""
        for action in recovery_data.get("recovery_actions", []):
            if action.get("action_type") == "restart":
                alert = self.create_alert(
                    alert_type="info",
                    severity="medium",
                    title=f"Auto Recovery - {action.get('instance_id')}",
                    message=f"Auto-recovery service restarted {action.get('instance_id')}",
                    source="auto_recovery",
                    network=action.get("network", "unknown"),
                    instance_id=action.get("instance_id"),
                    metadata=action
                )
                await self.send_alert(alert)
    
    async def save_alert_report(self):
        """Save alert report to file"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        report_file = self.monitoring_dir / f"alert_report_{timestamp}.json"
        
        report_data = {
            "timestamp": datetime.now().isoformat(),
            "active_alerts": {k: asdict(v) for k, v in self.active_alerts.items()},
            "recent_alerts": [asdict(alert) for alert in self.alert_history[-100:]],
            "alert_summary": {
                "total_alerts": len(self.alert_history),
                "active_alerts": len(self.active_alerts),
                "alerts_by_severity": {
                    "high": len([a for a in self.alert_history if a.severity == "high"]),
                    "medium": len([a for a in self.alert_history if a.severity == "medium"]),
                    "low": len([a for a in self.alert_history if a.severity == "low"])
                }
            }
        }
        
        with open(report_file, 'w') as f:
            json.dump(report_data, f, indent=2, default=str)
        
        # Keep only last 50 reports
        report_files = sorted(self.monitoring_dir.glob("alert_report_*.json"))
        if len(report_files) > 50:
            for old_file in report_files[:-50]:
                old_file.unlink()
    
    async def start_alerting_service(self):
        """Start continuous alerting service"""
        logger.info("Starting alerting service...")
        logger.info(f"Email alerts: {'Enabled' if self.email_config['enabled'] else 'Disabled'}")
        logger.info(f"Webhook alerts: {'Enabled' if self.webhook_config['enabled'] else 'Disabled'}")
        logger.info(f"Slack alerts: {'Enabled' if self.slack_config['enabled'] else 'Disabled'}")
        
        while True:
            try:
                # Save alert report
                await self.save_alert_report()
                
                # Clean up old alerts
                cutoff_date = datetime.now() - timedelta(days=self.alert_retention_days)
                self.alert_history = [alert for alert in self.alert_history if alert.timestamp > cutoff_date]
                
                await asyncio.sleep(self.check_interval)
            except KeyboardInterrupt:
                logger.info("Alerting service stopped by user")
                break
            except Exception as e:
                logger.error(f"Error in alerting service: {e}")
                await asyncio.sleep(self.check_interval)

def main():
    """Main entry point"""
    alerting_service = AlertingService()
    
    try:
        asyncio.run(alerting_service.start_alerting_service())
    except KeyboardInterrupt:
        logger.info("Alerting service stopped")
    except Exception as e:
        logger.error(f"Fatal error in alerting service: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
