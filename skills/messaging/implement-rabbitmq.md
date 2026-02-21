---
name: implement-rabbitmq
description: Set up RabbitMQ message queue with publishers and consumers
argument-hint: [pattern: publish-subscribe|work-queue|rpc]
---

# RabbitMQ Implementation

## Publisher (.NET)
```csharp
public class RabbitMQPublisher
{
    private readonly IConnection _connection;
    private readonly IModel _channel;

    public RabbitMQPublisher(string hostname)
    {
        var factory = new ConnectionFactory { HostName = hostname };
        _connection = factory.CreateConnection();
        _channel = _connection.CreateModel();

        _channel.QueueDeclare(
            queue: "orders",
            durable: true,
            exclusive: false,
            autoDelete: false,
            arguments: null
        );
    }

    public void Publish(string message)
    {
        var body = Encoding.UTF8.GetBytes(message);
        var properties = _channel.CreateBasicProperties();
        properties.Persistent = true;

        _channel.BasicPublish(
            exchange: "",
            routingKey: "orders",
            basicProperties: properties,
            body: body
        );
    }
}
```

## Consumer (.NET)
```csharp
public class RabbitMQConsumer : BackgroundService
{
    private readonly IConnection _connection;
    private readonly IModel _channel;

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var consumer = new EventingBasicConsumer(_channel);

        consumer.Received += (model, ea) =>
        {
            var body = ea.Body.ToArray();
            var message = Encoding.UTF8.GetString(body);

            try
            {
                ProcessMessage(message);
                _channel.BasicAck(ea.DeliveryTag, false);
            }
            catch (Exception ex)
            {
                _channel.BasicNack(ea.DeliveryTag, false, requeue: true);
            }
        };

        _channel.BasicConsume(
            queue: "orders",
            autoAck: false,
            consumer: consumer
        );

        return Task.CompletedTask;
    }

    private void ProcessMessage(string message)
    {
        // Handle message
    }
}
```

## Pub/Sub Pattern
```csharp
// Publisher
_channel.ExchangeDeclare("logs", ExchangeType.Fanout);
_channel.BasicPublish("logs", "", null, body);

// Subscriber
_channel.QueueDeclare(queue: "", durable: false, exclusive: true);
_channel.QueueBind(queue: queueName, exchange: "logs", routingKey: "");
```
