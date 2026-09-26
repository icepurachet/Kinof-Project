namespace Kinof.Agent;

internal sealed class AgentSessionState
{
    public int SeatNumber { get; private set; }
    public long SeatId { get; private set; }
    public long RoomId { get; private set; }
    public SessionUser? User { get; private set; }
    public string? Notice { get; private set; }

    public event Action? Changed;

    public void SetSeat(int seatNumber, long seatId, long roomId)
    {
        SeatNumber = seatNumber;
        SeatId = seatId;
        RoomId = roomId;
        Changed?.Invoke();
    }

    public void SetLoggedIn(SessionUser user)
    {
        User = user;
        Notice = null;
        Changed?.Invoke();
    }

    public void Clear(string? notice = null)
    {
        User = null;
        Notice = notice;
        Changed?.Invoke();
    }
}
