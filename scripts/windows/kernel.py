"""Windows kernel objects used to own a launcher instance and its process tree."""

import ctypes as ct
from ctypes import wintypes as wt

kernel = ct.WinDLL("kernel32", use_last_error=True)


def api(name, result, *args):
    fn = getattr(kernel, name)
    fn.restype = result
    fn.argtypes = args
    return fn


create_mutex = api("CreateMutexW", wt.HANDLE, wt.LPVOID, wt.BOOL, wt.LPCWSTR)
create_event = api("CreateEventW", wt.HANDLE, wt.LPVOID, wt.BOOL, wt.BOOL, wt.LPCWSTR)
wait_one = api("WaitForSingleObject", wt.DWORD, wt.HANDLE, wt.DWORD)
set_event = api("SetEvent", wt.BOOL, wt.HANDLE)
release_mutex = api("ReleaseMutex", wt.BOOL, wt.HANDLE)
close = api("CloseHandle", wt.BOOL, wt.HANDLE)
create_job = api("CreateJobObjectW", wt.HANDLE, wt.LPVOID, wt.LPCWSTR)
set_job = api(
    "SetInformationJobObject", wt.BOOL, wt.HANDLE, ct.c_int, wt.LPVOID, wt.DWORD
)
open_process = api("OpenProcess", wt.HANDLE, wt.DWORD, wt.BOOL, wt.DWORD)
assign_job = api("AssignProcessToJobObject", wt.BOOL, wt.HANDLE, wt.HANDLE)


def checked(value):
    if not value:
        raise ct.WinError(ct.get_last_error())
    return value


class Handle:
    def __init__(self, value):
        self.value = checked(value)

    def __enter__(self):
        return self

    def __exit__(self, *_):
        checked(close(self.value))

    def wait(self, milliseconds=0):
        result = wait_one(self.value, milliseconds)
        if result == 258:  # WAIT_TIMEOUT
            return False
        if result not in (0, 128):  # WAIT_OBJECT_0, WAIT_ABANDONED
            raise ct.WinError(ct.get_last_error())
        return True


class Mutex(Handle):
    def __init__(self, name):
        super().__init__(create_mutex(None, False, name))

    def release(self):
        checked(release_mutex(self.value))


class Event(Handle):
    def __init__(self, name):
        super().__init__(create_event(None, False, False, name))  # auto-reset

    def signal(self):
        checked(set_event(self.value))


class BasicLimits(ct.Structure):
    _fields_ = [
        ("process_time", ct.c_int64),
        ("job_time", ct.c_int64),
        ("flags", wt.DWORD),
        ("min_working_set", ct.c_size_t),
        ("max_working_set", ct.c_size_t),
        ("process_limit", wt.DWORD),
        ("affinity", ct.c_size_t),
        ("priority", wt.DWORD),
        ("scheduling", wt.DWORD),
    ]


class ExtendedLimits(ct.Structure):
    _fields_ = [
        ("basic", BasicLimits),
        ("io_counters", ct.c_uint64 * 6),
        ("process_memory", ct.c_size_t),
        ("job_memory", ct.c_size_t),
        ("peak_process_memory", ct.c_size_t),
        ("peak_job_memory", ct.c_size_t),
    ]


class Job(Handle):
    def __init__(self):
        super().__init__(create_job(None, None))
        limits = ExtendedLimits()
        limits.basic.flags = 0x2000  # JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE
        try:
            checked(set_job(self.value, 9, ct.byref(limits), ct.sizeof(limits)))
        except OSError:
            close(self.value)
            raise

    def attach(self, pid):
        # Attach the waiting worker before allowing it to create any children.
        with Handle(open_process(0x0100 | 0x0001, False, pid)) as process:
            checked(assign_job(self.value, process.value))
