import type { Prisma } from "@prisma/client";
import { BookingStatus, OrganizationRoles } from "@prisma/client";
import type { MetaFunction, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import type { ShouldRevalidateFunction } from "@remix-run/react";
import { Link, Outlet, useMatches, useNavigate } from "@remix-run/react";
import { AvailabilityBadge } from "~/components/booking/availability-label";
import BulkActionsDropdown from "~/components/booking/bulk-actions-dropdown";
import { StatusFilter } from "~/components/booking/status-filter";
import { ErrorContent } from "~/components/errors";

import { ChevronRight } from "~/components/icons/library";
import ContextualModal from "~/components/layout/contextual-modal";
import Header from "~/components/layout/header";
import type { HeaderData } from "~/components/layout/header/types";
import LineBreakText from "~/components/layout/line-break-text";
import { List } from "~/components/list";
import { ListContentWrapper } from "~/components/list/content-wrapper";
import { Filters } from "~/components/list/filters";
import { Badge } from "~/components/shared/badge";
import { Button } from "~/components/shared/button";
import { Td, Th } from "~/components/table";
import { getBookings } from "~/modules/booking/service.server";
import { setSelectedOrganizationIdCookie } from "~/modules/organization/context.server";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { getDateTimeFormat } from "~/utils/client-hints";
import {
  setCookie,
  updateCookieWithPerPage,
  userPrefs,
} from "~/utils/cookies.server";
import { makeShelfError } from "~/utils/error";
import { data, error, getCurrentSearchParams } from "~/utils/http.server";
import { getParamsValues } from "~/utils/list";
import {
  PermissionAction,
  PermissionEntity,
} from "~/utils/permissions/permission.validator.server";
import { requirePermission } from "~/utils/roles.server";

export async function loader({ context, request }: LoaderFunctionArgs) {
  const authSession = context.getSession();
  const { userId } = authSession;

  try {
    const { organizationId, role } = await requirePermission({
      userId: authSession?.userId,
      request,
      entity: PermissionEntity.booking,
      action: PermissionAction.read,
    });
    const isSelfService = role === OrganizationRoles.SELF_SERVICE;
    const searchParams = getCurrentSearchParams(request);
    const { page, perPageParam, search, status } =
      getParamsValues(searchParams);
    const cookie = await updateCookieWithPerPage(request, perPageParam);
    const { perPage } = cookie;

    const { bookings, bookingCount } = await getBookings({
      organizationId,
      page,
      perPage,
      search,
      userId: authSession?.userId,
      ...(status && {
        // If status is in the params, we filter based on it
        statuses: [status],
      }),
      ...(isSelfService && {
        // If the user is self service, we only show bookings that belong to that user)
        custodianUserId: authSession?.userId,
      }),
    });

    const totalPages = Math.ceil(bookingCount / perPage);

    const header: HeaderData = {
      title: "Bookings",
    };
    const modelName = {
      singular: "booking",
      plural: "bookings",
    };

    /** We format the dates on the server based on the users timezone and locale  */
    const items = bookings.map((b) => {
      if (b.from && b.to) {
        const from = new Date(b.from);
        const displayFrom = getDateTimeFormat(request, {
          dateStyle: "short",
          timeStyle: "short",
        }).format(from);

        const to = new Date(b.to);
        const displayTo = getDateTimeFormat(request, {
          dateStyle: "short",
          timeStyle: "short",
        }).format(to);

        return {
          ...b,
          displayFrom: displayFrom.split(","),
          displayTo: displayTo.split(","),
        };
      }
      return b;
    });

    return json(
      data({
        header,
        items,
        search,
        page,
        totalItems: bookingCount,
        totalPages,
        perPage,
        modelName,
      }),
      {
        headers: [
          setCookie(await userPrefs.serialize(cookie)),
          setCookie(await setSelectedOrganizationIdCookie(organizationId)),
        ],
      }
    );
  } catch (cause) {
    const reason = makeShelfError(cause, { userId });
    throw json(error(reason), { status: reason.status });
  }
}

export const meta: MetaFunction<typeof loader> = ({ data }) => [
  { title: data ? appendToMetaTitle(data.header.title) : "" },
];

export const handle = {
  name: "bookings.index",
  breadcrumb: () => <Link to="/bookings">Bookings</Link>,
};

export const shouldRevalidate: ShouldRevalidateFunction = ({
  nextUrl,
  defaultShouldRevalidate,
}) => {
  /** Dont revalidate on add-assets route */
  const isAddAssetsRoute = nextUrl.pathname.includes("add-assets");
  if (isAddAssetsRoute) {
    return false;
  }
  return defaultShouldRevalidate;
};

export type RouteHandleWithName = {
  name?: string;
  [key: string]: any;
};

export default function BookingsIndexPage({
  className,
}: {
  className?: string;
}) {
  const navigate = useNavigate();
  const matches = useMatches();

  const currentRoute: RouteHandleWithName = matches[matches.length - 1];

  /**
   * We have 3 cases when we should render index:
   * 1. When we are on the index route
   * 2. When we are on the .new route - the reason we do this is because we want to have the .new modal overlaying the index.
   * 3. When we are on the assets.$assetId.bookings page
   */
  const shouldRenderIndex =
    currentRoute?.handle?.name === ("bookings.index" as string) ||
    currentRoute?.handle?.name === "bookings.new" ||
    currentRoute?.handle?.name === "$assetId.bookings";

  const isAssetBookingsPage =
    currentRoute?.handle?.name === "$assetId.bookings";

  return shouldRenderIndex ? (
    <>
      {!isAssetBookingsPage ? (
        <Header>
          <Button
            to="new"
            role="link"
            aria-label={`new booking`}
            data-test-id="createNewBooking"
            prefetch="none"
          >
            New booking
          </Button>
        </Header>
      ) : null}

      <ListContentWrapper className={className}>
        <Filters
          slots={{
            "left-of-search": <StatusFilter statusItems={BookingStatus} />,
          }}
        />
        <List
          bulkActions={<BulkActionsDropdown />}
          ItemComponent={ListAssetContent}
          navigate={(id) => navigate(`/bookings/${id}`)}
          className="overflow-x-visible md:overflow-x-auto"
          headerChildren={
            <>
              <Th className="hidden md:table-cell" />
              <Th className="hidden md:table-cell">Description</Th>

              <Th className="hidden md:table-cell">From</Th>
              <Th className="hidden md:table-cell">To</Th>
              <Th className="hidden md:table-cell">Custodian</Th>
              <Th className="hidden md:table-cell">Created by</Th>
            </>
          }
        />
      </ListContentWrapper>
      <ContextualModal />
    </>
  ) : (
    <Outlet />
  );
}

export const bookingStatusColorMap: { [key in BookingStatus]: string } = {
  DRAFT: "#667085",
  RESERVED: "#175CD3",
  ONGOING: "#7A5AF8",
  OVERDUE: "#B54708",
  COMPLETE: "#17B26A",
  ARCHIVED: "#667085",
  CANCELLED: "#667085",
};

const ListAssetContent = ({
  item,
}: {
  item: Prisma.BookingGetPayload<{
    include: {
      assets: {
        select: {
          id: true;
          availableToBook: true;
          custody: true;
        };
      };
      creator: {
        select: {
          id: true;
          firstName: true;
          lastName: true;
          profilePicture: true;
        };
      };
      from: true;
      to: true;
      custodianUser: true;
      custodianTeamMember: true;
    };
  }> & {
    displayFrom?: string[];
    displayTo?: string[];
  };
}) => {
  const hasUnavaiableAssets =
    item.assets.some(
      (asset) => !asset.availableToBook || asset.custody !== null
    ) && !["COMPLETE", "CANCELLED", "ARCHIVED"].includes(item.status);
  return (
    <>
      {/* Item */}
      <Td className="w-full min-w-52 whitespace-normal p-0 md:p-0">
        <div className="flex justify-between gap-3 py-4 pr-4 md:justify-normal md:pr-6">
          <div className="flex items-center gap-3">
            <div className="min-w-[130px]">
              <span className="word-break mb-1 block font-medium">
                {item.name}
              </span>
              <div className="">
                <Badge color={bookingStatusColorMap[item.status]}>
                  <span className="block lowercase first-letter:uppercase">
                    {item.status}
                  </span>
                </Badge>
              </div>
            </div>
          </div>

          <button className="block md:hidden">
            <ChevronRight />
          </button>
        </div>
      </Td>

      {/**
       * Optional label when the booking includes assets that are either:
       * 1. Marked as not available for boooking
       * 2. Have custody
       * 3. Have other bookings with the same period - this I am not sure how to handle yet
       * */}
      <Td className="hidden md:table-cell">
        {hasUnavaiableAssets ? (
          <AvailabilityBadge
            badgeText={"Includes unavailable assets"}
            tooltipTitle={"Booking includes unavailable assets"}
            tooltipContent={
              "There are some assets within this booking that are unavailable for reservation because they are checked-out, have custody assigned or are marked as not allowed to book"
            }
          />
        ) : null}
      </Td>

      <Td className="hidden md:table-cell">
        {item.description ? <LineBreakText text={item.description} /> : null}
      </Td>

      {/* From */}
      <Td className="hidden md:table-cell">
        {item.displayFrom ? (
          <div className="min-w-[130px]">
            <span className="word-break mb-1 block font-medium">
              {item.displayFrom[0]}
            </span>
            <span className="block text-gray-600">{item.displayFrom[1]}</span>
          </div>
        ) : null}
      </Td>

      {/* To */}
      <Td className="hidden md:table-cell">
        {item.displayTo ? (
          <div className="min-w-[130px]">
            <span className="word-break mb-1 block font-medium">
              {item.displayTo[0]}
            </span>
            <span className="block text-gray-600">{item.displayTo[1]}</span>
          </div>
        ) : null}
      </Td>

      {/* Custodian */}
      <Td className="hidden md:table-cell">
        {item?.custodianUser ? (
          <UserBadge
            img={
              item?.custodianUser?.profilePicture ||
              "/static/images/default_pfp.jpg"
            }
            name={`${item?.custodianUser?.firstName || ""} ${
              item?.custodianUser?.lastName || ""
            }`}
          />
        ) : item?.custodianTeamMember ? (
          <UserBadge name={item.custodianTeamMember.name} />
        ) : null}
      </Td>

      {/* Created by */}
      <Td className="hidden md:table-cell">
        <UserBadge
          img={
            item?.creator?.profilePicture || "/static/images/default_pfp.jpg"
          }
          name={`${item?.creator?.firstName || ""} ${
            item?.creator?.lastName || ""
          }`}
        />
      </Td>
    </>
  );
};

function UserBadge({ img, name }: { img?: string; name: string }) {
  return (
    <span className="inline-flex w-max items-center justify-center rounded-2xl bg-gray-100 px-2 py-[2px] text-center text-[12px] font-medium text-gray-700">
      <img
        src={img || "/static/images/default_pfp.jpg"}
        className="mr-1 size-4 rounded-full"
        alt=""
      />
      <span className="mt-px">{name}</span>
    </span>
  );
}

export type BookingWithCustodians = Prisma.BookingGetPayload<{
  include: {
    assets: true;
    from: true;
    to: true;
    custodianUser: true;
    custodianTeamMember: true;
  };
}>;

export const ErrorBoundary = () => <ErrorContent />;
