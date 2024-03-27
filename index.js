"use strict";
const pulumi = require("@pulumi/pulumi");
const aws = require("@pulumi/aws");
const awsx = require("@pulumi/awsx");
const apigateway = require("@pulumi/aws-apigateway");
const archive = require("@pulumi/archive");


/*Option #1 plan
1. create a storage bucket
    - s3 bucket creation
    - add a file to the bucket
2. create a database table
    -create a VPC for database
    -create a subnet in 2 avaliability zones
    -create a security group for DB instance in VPC
    
3. create a serverless function
    -create API gateway
    -create lamda function
4. create a component resource*/


const lambda = archive.getFile({
    type: "zip",
    sourceFile: "./function.js",
    outputPath: "lambda_function_payload.zip",
});

// Creating a new IAM Role
const proxyRole = new aws.iam.Role("role", {
    assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: "sts:AssumeRole",
            Principal: {
                Service: "ecs-tasks.amazonaws.com",
            },
            Effect: "Allow",
            Sid: "",
        }],
    }),
});


// Creating a policy
const policy = new aws.iam.RolePolicy("policy", {
    role: proxyRole.id,
    policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [{
            Action: [
                "rds-db:connect",
            ],
            Effect: "Allow",
            Resource: [
                "arn:aws:rds-db:us-west-2:123456789012:dbuser:prx-1234567890123456a/testuser",
            ],
        }],
    }),
});



//Create a role ARN for Lambda
const lambdaRole = aws.iam.getPolicyDocument({
    statements: [{
        effect: "Allow",
        principals: [{
            type: "Service",
            identifiers: ["lambda.amazonaws.com"],
        }],
        actions: ["sts:AssumeRole"],
    }],
});
const iamForLambda = new aws.iam.Role("iam_for_lambda", {
    name: "iam_for_lambda",
    assumeRolePolicy: lambdaRole.then(lambdaRole => lambdaRole.json),
});


// Create an AWS resource (S3 Bucket)
const bucket = new aws.s3.Bucket("file-bucket",{
    bucketName: "yte-challenge-bucket",

});


/******************VPC COMPONENTS ********************/
//Create VPC
const vpc = new aws.ec2.Vpc("vpc", {
    name: "challenge-vpc",
    cidrBlock: "10.0.0.0/24",
    tags:{
        Name: "challenge-vpc",
    },
   
});

//Create Subnet-1
const subnet1 = new aws.ec2.Subnet("subnet-1", {
    name: "challenge-subnet-1",
    vpcId : vpc.id,
    cidrBlock: "10.0.0.0/25",
    availabilityZone: "us-east-1a",
    tags:{
        Name: "challenge-subnet-1",
    },

});

//Create Subnet-2
const subnet2 = new aws.ec2.Subnet("subnet-2", {
    name: "challenge-subnet-2",
    vpcId : vpc.id,
    cidrBlock: "10.0.0.128/25",
    availabilityZone: "us-east-1b",
    tags:{
        Name: "challenge-subnet-2",
    },
});

//create internet gateway
const gw = new aws.ec2.InternetGateway("igw",{
    name: "challenge-igw",
    vpcId: vpc.id,
    tags:{
        Name: "challenge-igw",
    },
});


//create security group
const sg = new aws.ec2.SecurityGroup("sg",{
    name: "challenge-sg",
    vpcId: vpc.id,
    ingress:[{
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
        ipv6CidrBlocks: ["::/0"],
    }],
    egress:[{
        fromPort: 0,
        toPort: 0,
        protocol: "-1",
        cidrBlocks: ["0.0.0.0/0"],
        ipv6CidrBlocks: ["::/0"],
    }],
    tags:{
        Name: "challenge-sg",
    },
});

//***************** DATABASE COMPONENTS ******************/

//Create Subnet Group
const subnetGrp = new aws.rds.SubnetGroup("subnet-grp", {
    name: "db-subnet-grp",
    subnetIds:[
        subnet1.id,
        subnet2.id,
    ],
    tags:{
        Name: "db-subnet-grp"
    }
});

//Create secret

const proxySecret = new aws.secretsmanager.Secret("proxy-secret", {
    name: "proxy-secret",
    tags:{
        Name: "challenge-secret",
    },
});

//Create RDS Proxy
const rdsProxy = new aws.rds.Proxy("rds-proxy",{
    engineFamily: "MYSQL",
    roleArn: proxyRole.arn, 
    vpcSecurityGroupIds:[sg.id],
    auths: [{
        authScheme: "SECRETS",
        description: "example",
        iamAuth: "DISABLED",
        secretArn: proxySecret.arn,
    }],

    vpcSubnetIds:[
        subnet1.id,
        subnet2.id,
    ]
})

//Create DB instance
const dbInst = new aws.rds.Instance("db-inst", {
    instanceClass: "db.t3.micro",
    dbName: "objecttracking",
    engine: "mysql",
    engineVersion: "5.7",
    allocatedStorage: 10,
    vpcSecurityGroupIds: [sg.id],
    dbSubnetGroupName: "db-subnet-grp",
    username: "testuser",
    password: "usertest24",

});



/***************** SERVERLESS FUNCTION COMPONENTS *******************/



//Create function
const fn = new aws.lambda.Function("fn", {
    name: "object-tracking-fn",
    role: iamForLambda.arn,
    runtime: "nodejs18.x",
    handler: "function.js",
    code :  new pulumi.asset.FileArchive("./lambda_function_payload.zip"),
    tags:{
        Name: "challenge-fn",
    },
});

//Create API Gateway
const api = new apigateway.RestAPI("apigw",{
    routes:[
        {
        path: "/", 
        localPath: "./function.js"
        },

        {
        path: "/date", 
        method: "GET", 
        eventHandler: fn},
    ],
    tags:{
        Name: "challenge-apigw"
    }
});



// Export the name of the bucket
exports.bucketName = bucket.id;
