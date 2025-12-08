# Flora Terraform Architecture - Deep Dive

## 🎯 Core Concepts

### Terraform vs AWS Console

| Aspect | AWS Console (Manual) | Terraform (IaC) |
|--------|---------------------|-----------------|
| **Creation** | Click through UI | Write code |
| **Reproducible** | ❌ No | ✅ Yes |
| **Version Control** | ❌ No | ✅ Yes (git) |
| **Team Collaboration** | ❌ Hard | ✅ Easy |
| **Track Changes** | ❌ Manual | ✅ Automatic (state) |
| **Automation** | ❌ No | ✅ Yes |

### How Terraform Works

```
┌──────────────────────────────────────────────────────────────┐
│                    Terraform Workflow                         │
└──────────────────────────────────────────────────────────────┘

1. You Write Code (.tf files)
   ↓
2. Terraform Init (downloads providers)
   ↓
3. Terraform Plan (preview changes)
   ↓
4. Terraform Apply
   │
   ├─> Reads your .tf files
   ├─> Reads current state (terraform.tfstate)
   ├─> Calculates diff: "What needs to change?"
   ├─> Calls AWS APIs to create/update/delete resources
   └─> Updates state file
   ↓
5. Resources Created in AWS
   ↓
6. Terraform Outputs (URLs, endpoints, etc.)
```

## 📁 File Architecture & Data Flow

### Main Terraform Files

```
terraform/
├── main.tf              # 🧠 Brain: Orchestrates everything
├── variables.tf         # 📝 Schema: Defines what inputs needed
├── terraform.tfvars     # 🔐 Values: Your actual secrets/config
├── outputs.tf           # 📤 Results: What to display after creation
└── .terraform.tfstate   # 💾 State: Current infrastructure snapshot
```

### Module Architecture

```
modules/
├── rds/                  # Database component
│   ├── main.tf          # Creates: RDS instance, subnet group, security group
│   ├── variables.tf     # Needs: VPC ID, password, subnet IDs
│   └── outputs.tf       # Provides: DB endpoint, connection string
│
├── elastic_beanstalk/   # Backend API component
│   ├── main.tf          # Creates: EB app, environment, ALB, IAM roles
│   ├── variables.tf     # Needs: VPC ID, subnets, env vars
│   └── outputs.tf       # Provides: API URL, security group ID
│
└── s3_cloudfront/       # Frontend CDN component
    ├── main.tf          # Creates: S3 bucket, CloudFront distribution
    ├── variables.tf     # Needs: Project name, backend URL
    └── outputs.tf       # Provides: CloudFront URL, bucket name
```

## 🔄 Complete Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                       CONFIGURATION LAYER                        │
└─────────────────────────────────────────────────────────────────┘

terraform.tfvars (You fill this)
├─ database_password = "secret123"
├─ auth0_client_secret = "xyz..."
└─ stripe_secret_key = "sk_..."
         │
         ▼
variables.tf (Schema validation)
├─ Validates types
├─ Marks sensitive vars
└─ Provides defaults
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     ORCHESTRATION LAYER                          │
└─────────────────────────────────────────────────────────────────┘

main.tf
├─ Creates VPC, subnets, routing
│
├─ Calls Module: RDS
│  └─ Passes: vpc_id, subnets, password
│      │
│      ▼
│  modules/rds/main.tf creates:
│      ├─ aws_db_subnet_group
│      ├─ aws_security_group (allow port 5432 from EB)
│      └─ aws_db_instance (PostgreSQL)
│          │
│          └─ Outputs: connection_string
│
├─ Calls Module: Elastic Beanstalk
│  └─ Passes: vpc_id, subnets, env_vars
│      ├─ env_vars.DATABASE_URL = module.rds.connection_string ◄──┐
│      │                                                            │
│      ▼                                                            │
│  modules/elastic_beanstalk/main.tf creates:                      │
│      ├─ aws_elastic_beanstalk_application                        │
│      ├─ aws_elastic_beanstalk_environment                        │
│      │   └─ Environment Variables:                               │
│      │       ├─ DATABASE_URL ────────────────────────────────────┘
│      │       ├─ AUTH0_DOMAIN
│      │       └─ STRIPE_SECRET_KEY
│      ├─ aws_security_group (allow HTTP/HTTPS)
│      ├─ IAM roles & policies
│      └─ Application Load Balancer
│          │
│          └─ Outputs: application_url, security_group_id
│
└─ Calls Module: S3 + CloudFront
   └─ Passes: backend_url = module.elastic_beanstalk.application_url
       │
       ▼
   modules/s3_cloudfront/main.tf creates:
       ├─ aws_s3_bucket
       ├─ aws_s3_bucket_policy (allow CloudFront)
       ├─ aws_cloudfront_distribution
       │   └─ Origin: S3 bucket
       └─ Outputs: cloudfront_url, bucket_name
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                        OUTPUT LAYER                              │
└─────────────────────────────────────────────────────────────────┘

outputs.tf aggregates:
├─ frontend_url = module.s3_cloudfront.cloudfront_url
├─ backend_url = module.elastic_beanstalk.application_url
└─ database_endpoint = module.rds.db_endpoint (sensitive)
```

## 🎬 Step-by-Step Execution

### When you run `terraform apply`:

```
PHASE 1: INITIALIZATION
→ Read all .tf files
→ Load terraform.tfvars
→ Validate syntax

PHASE 2: DEPENDENCY GRAPH
Terraform builds a graph:

  VPC
   ├─> Subnets
   │    ├─> RDS (needs subnets)
   │    └─> EB (needs subnets)
   │         └─> Needs RDS output first!
   └─> Internet Gateway
        └─> Route Table

PHASE 3: PARALLEL EXECUTION
→ Creates independent resources in parallel
→ Waits for dependencies

Example Timeline:
[0:00] VPC created
[0:30] Subnets + IGW created (parallel)
[1:00] RDS starts creating
[5:00] RDS ready → EB starts creating
[8:00] EB ready → S3 + CloudFront start
[10:00] All complete!

PHASE 4: STATE MANAGEMENT
→ Saves to terraform.tfstate:
  {
    "vpc_id": "vpc-abc123",
    "rds_endpoint": "flora-db.xxx.rds.amazonaws.com",
    ...
  }
```

## 🔗 Module Communication

### Example: How RDS password reaches the database

```
1. You set in terraform.tfvars:
   database_password = "SecurePass123!"

2. variables.tf defines it:
   variable "database_password" {
     type = string
     sensitive = true
   }

3. main.tf passes to RDS module:
   module "rds" {
     database_password = var.database_password  # From tfvars
   }

4. modules/rds/variables.tf receives it:
   variable "database_password" {
     type = string
   }

5. modules/rds/main.tf uses it:
   resource "aws_db_instance" "postgres" {
     password = var.database_password
   }

6. modules/rds/outputs.tf includes it in connection string:
   output "connection_string" {
     value = "postgresql://user:${var.database_password}@endpoint/db"
     sensitive = true
   }

7. main.tf uses that output for EB:
   module "elastic_beanstalk" {
     env_vars = {
       DATABASE_URL = module.rds.connection_string
     }
   }

8. EB module sets it as environment variable:
   setting {
     namespace = "aws:elasticbeanstalk:application:environment"
     name      = "DATABASE_URL"
     value     = var.env_vars["DATABASE_URL"]
   }

9. Your backend Docker container reads it:
   process.env.DATABASE_URL
```

## 📊 State File (`terraform.tfstate`)

### What is it?

```json
{
  "version": 4,
  "terraform_version": "1.5.0",
  "resources": [
    {
      "type": "aws_vpc",
      "name": "main",
      "instances": [
        {
          "attributes": {
            "id": "vpc-0abc123def456",
            "cidr_block": "10.0.0.0/16"
          }
        }
      ]
    },
    {
      "type": "aws_db_instance",
      "name": "postgres",
      "instances": [
        {
          "attributes": {
            "id": "flora-db",
            "endpoint": "flora-db.xyz.ap-southeast-2.rds.amazonaws.com:5432"
          }
        }
      ]
    }
  ]
}
```

### Why important?

1. **Tracks reality**: Terraform knows what exists in AWS
2. **Enables updates**: Compare current vs desired state
3. **Prevents conflicts**: Multiple team members don't create duplicates
4. **Allows destruction**: Terraform knows what to delete

### State Management Best Practices

```bash
# ❌ BAD: Local state file (lost if computer dies)
terraform apply  # Creates terraform.tfstate locally

# ✅ GOOD: Remote state in S3 (team-shared, backed up)
# In main.tf:
terraform {
  backend "s3" {
    bucket = "flora-terraform-state"
    key    = "production/terraform.tfstate"
    region = "ap-southeast-2"
  }
}
```

## 🏗️ Infrastructure Lifecycle

### Create

```bash
terraform init    # Setup
terraform plan    # Preview
terraform apply   # Create
```

### Update

```bash
# Change main.tf (e.g., increase RDS storage)
terraform plan    # Shows: will update aws_db_instance
terraform apply   # Updates only that resource
```

### Destroy

```bash
terraform destroy  # Deletes EVERYTHING
# Or destroy specific resource:
terraform destroy -target=module.rds
```

## 🎓 Key Concepts Summary

| Concept | What it is | Why it matters |
|---------|-----------|----------------|
| **Resource** | Single AWS thing (VPC, RDS, S3) | Building blocks |
| **Module** | Group of related resources | Reusable components |
| **Variable** | Input parameter | Customization |
| **Output** | Result/info to expose | Pass data, show URLs |
| **State** | Current infrastructure snapshot | Enables updates/deletes |
| **Provider** | AWS API connector | How Terraform talks to AWS |
| **Data Source** | Read existing AWS resource | Use existing infrastructure |

## 🔍 Debugging Tips

### See what Terraform will do:
```bash
terraform plan -out=tfplan
terraform show tfplan  # Detailed view
```

### See current state:
```bash
terraform show  # All resources
terraform state list  # List resources
terraform state show aws_vpc.main  # Show specific resource
```

### See outputs:
```bash
terraform output  # All outputs
terraform output backend_api_url  # Specific output
```

### Visualize dependency graph:
```bash
terraform graph | dot -Tpng > graph.png
```

This will create a visual diagram of how resources depend on each other!
