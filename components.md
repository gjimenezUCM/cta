# CTA Components

CTA is composed of different components working together to schedule, run, collect tests results and more.

![Display of CTA Components Schema](images/schema.png)

## Scheduler

The Scheduler handles all the scheduling of the system.

### Type of schedules

The different type of events being scheduled are the following:

- Scenario : A scenario can be scheduled at a given time or recurring time to run a testsuite on a given configuration
- Pending Timeout : An execution has a maximum given time to get executed, after which time the execution is Cancelled.
- VM Timeout : A Virtual Machine created on the fly to execute a scenario is to be destroyed after a given timeout.

### Fix time

A schedule can be configured as a point in time by providing a UTC date (stored as an ISO String)

### Recurring time

A recurring schedule can be configured by defining a [Cron](https://en.wikipedia.org/wiki/Cron) syntax.

### Resiliency

More than one CTA Scheduler can be used to schedule events in the system. As such an election mechanism takes
place to decide of the Scheduler that triggers the event.
Election mechanism is currently done by using MongoDB as a judge of who is to trigger scheduled event.
Another election mechanism could be based on Mesos to benefit from Mesos scheduling ability ... at the cost of supporting a Mesos deployment.

## API

The API handles all actions performed by users or automated process on CTA

### REST API

The REST API is composed of multiple REST service to peform actions on CTA

Please follow the [REST services guide](rest-services.md) for an exhaustive list of the APIs available.

### Web Socket API

The Web Socket API is composed of multiple services that the CTA UI will subscribe to
in order to subscribe to updates.

Please follow the [Web socket services guide](ws-services.md) for an exhaustive list of the APIs available.

## Composer

The Composer composes/creates an execution based on a scenario composed of a testsuite and a configuration on which to run a testsuite.
The composer is also taking care of pushing an execution event either against a dedicated machine or a group of machine.
Finally the composer is handling the parallelization of tests by decomposing an execution event in a set of execution test events to realize.

### Dedicated test machine

The composer search through all CTA registered test machines for the ones matching the configuration of a scenario.
When only one machine matches such configuration, the created execution will trigger an execution event to the dedicated queue of that machine.

### Group of machines

In case the composer find numerous machines matching the configuration defined in the scenario of test, the composer
will create a dedicated group queue in which it will push an execution event describing the tests to execute.

### Parallelization of tests

In case a scenario of tests has been configured to be parallelized, instead of an execution event being pushed to a group queue
or a machine queue, it's a set of test events which will be pushed to those queues, ensuring parallelization of the execution
in case of a group of machines

### Counterparties

The Composer receives events to execute a scenario either from a Scheduler or from the REST API

### Agentless

Should agentless test machine concept being aggregated to CTA, a Composer should send an execution event to a new Agentless component
that would be in charged to execute tests via SSH connectivity to test machine.

## Agent

A CTA Agent is installed on every Test Machine to control execution of tests.

### Test type

### Group management

### Silos

### REST API

## HTTP Gateway

CTA Agents can be configured to connect to CTA via HTTPS. For this to happen, CTA HTTP Gateways are created to handle the proxying
of communication from message broker to HTTPs

## Consumer

The Consumer consumes every event generated by CTA Agents to report Agents configuration and statuses of executions run by agent.

Consumption leads to mostly 2 actions

### Storage of the statuses

The consumer receives and treats every events generated by the CTA Agents.

#### Registration event 

Upon starting, the agent generates a registration event informing CTA of a machine ability to treat / handle tests

[TODO with Such event 


- Execution state event : When an Agent handles a test, it reports potentially four different states
    - running   : Test suite execution is being run
    - finished  : Test suite has been completed
    - cancelled : Test suite has been cancelled either by manual user intervention or automatically because of a time out
    - acked     : In case of a test suite run against a group of machine, the agent acknowledges that although it received the test suite execution, another agent in the group of machines already handled the execution.
- Execution test status event : For every tests executed during the execution of the test suite there should be a test status composed of different elements
    - id          : unique identifier of the test (uniqueness in the scope of the execution)
    - status      : result of the test
        - ok           : test was successful
        - failed       : test failed
        - partial      : some part of the test was successful while other parts could not be executed due to some missing elements outside of the test context
        - inconclusive : test was unable to be run as the mandatory conditions to run the test were not established.
    - message     : a message relevant to the status of the test
    - description : a description of the goal of the test
    - attachment  : a file attached with data relevant to the test
    - screenshot  : a screenshot relevant to the status of the test
    - ******      : any other attribute is considered custom data relevant to the test owner
    
All those events are stored and linked to the relevant machine or scenario execution

### Callbacks
 
Once the consumer is done storing the above events some callbacks can get triggered as a reaction 

## UI

CTA FrontEnd

## VM Manager

The VM Manager handles creation and deletion of VMs