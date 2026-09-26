using Kinof.Agent;

using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;

namespace Kinof.Agent;

internal static class Program
{
    [STAThread]
    private static void Main(string[] args)
    {
        ApplicationConfiguration.Initialize();

        var builder = Host.CreateApplicationBuilder(args);
        builder.Services.AddWindowsService(options => options.ServiceName = "KinofAgent");
        builder.Services.AddSingleton<AgentApiClient>();
        builder.Services.AddSingleton<AgentSessionState>();
        builder.Services.AddSingleton<HostsWebsiteBlocker>();
        builder.Services.AddSingleton<ProgramProcessBlocker>();
        builder.Services.AddSingleton<LoginForm>();
        builder.Services.AddHostedService<Worker>();

        var host = builder.Build();
        var form = host.Services.GetRequiredService<LoginForm>();
        host.Start();
        try
        {
            Application.Run(form);
        }
        finally
        {
            host.StopAsync().GetAwaiter().GetResult();
            host.Dispose();
        }
    }
}
